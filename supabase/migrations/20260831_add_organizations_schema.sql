-- Create Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    corporate_domain TEXT,
    privacy_shield_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS privacy_shield_enabled BOOLEAN DEFAULT TRUE;

-- Create Organization Members Table
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

-- Add Scoping Columns to memories table
ALTER TABLE public.memories 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

-- Add Scoping Columns to oauth_tokens table
ALTER TABLE public.oauth_tokens 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

-- Add Columns to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'individual' CHECK (account_type IN ('individual', 'organization')),
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_memories_org_scope ON public.memories (organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_org_members_user_role ON public.organization_members (user_id, role);

-- Enable RLS on public.memories
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid duplication errors
DROP POLICY IF EXISTS "Users can view their own memories" ON public.memories;
DROP POLICY IF EXISTS "Admins can view organization-scoped memories" ON public.memories;

-- Policy A: Users can always read their own data (Personal or Organization)
CREATE POLICY "Users can view their own memories" ON public.memories
FOR SELECT
USING (user_id = auth.uid());

-- Policy B: Organization Admins can view organization-scoped memories
CREATE POLICY "Admins can view organization-scoped memories" ON public.memories
FOR SELECT
USING (
    scope = 'organizational' 
    AND organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

-- ============================================================================
-- MULTI-TENANT SEARCH FUNCTION UPDATES
-- ============================================================================

-- Drop old functions first to prevent return type mismatch errors
DROP FUNCTION IF EXISTS public.hybrid_search(text, vector, integer, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.hybrid_search(text, vector, integer, uuid);
DROP FUNCTION IF EXISTS public.match_memories(vector, float, integer, uuid);
DROP FUNCTION IF EXISTS public.match_memories(vector, double precision, integer, uuid);

-- Recreate hybrid_search at 1024 dims with multi-tenant support
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text      TEXT,
  query_embedding vector(1024),
  match_count     INT,
  user_id_arg     UUID,
  start_date      TIMESTAMPTZ DEFAULT NULL,
  end_date        TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  platform        TEXT,
  source_id       TEXT,
  event_type      TEXT,
  title           TEXT,
  content         TEXT,
  author          TEXT,
  source_url      TEXT,
  event_timestamp TIMESTAMPTZ,
  metadata        JSONB,
  is_flagged      BOOLEAN,
  similarity      FLOAT,
  keyword_rank    FLOAT,
  combined_score  FLOAT
)
LANGUAGE sql
AS $$
  WITH semantic_matches AS (
    SELECT
      m.id,
      (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
    FROM memories m
    WHERE (m.user_id = user_id_arg OR (m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg) AND m.scope = 'organizational'))
      AND m.embedding IS NOT NULL
      AND (start_date IS NULL OR m.timestamp >= start_date)
      AND (end_date   IS NULL OR m.timestamp <= end_date)
    ORDER BY m.embedding <=> query_embedding
    LIMIT 50
  ),
  keyword_matches AS (
    SELECT
      m.id,
      ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text))::FLOAT AS keyword_rank
    FROM memories m
    WHERE (m.user_id = user_id_arg OR (m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg) AND m.scope = 'organizational'))
      AND m.fts @@ websearch_to_tsquery('english', query_text)
      AND (start_date IS NULL OR m.timestamp >= start_date)
      AND (end_date   IS NULL OR m.timestamp <= end_date)
    ORDER BY ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text)) DESC
    LIMIT 50
  )
  SELECT
    m.id,
    m.platform,
    m.source_id,
    m.event_type,
    m.title,
    m.content,
    m.author,
    m.source_url,
    m.timestamp AS event_timestamp,
    m.metadata,
    m.is_flagged,
    COALESCE(sm.similarity, (1 - (m.embedding <=> query_embedding))::FLOAT) AS similarity,
    COALESCE(km.keyword_rank, ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text))::FLOAT) AS keyword_rank,
    (
      COALESCE(sm.similarity, (1 - (m.embedding <=> query_embedding))::FLOAT) * 0.7
      + COALESCE(km.keyword_rank, ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text))::FLOAT) * 0.3
    )::FLOAT AS combined_score
  FROM memories m
  LEFT JOIN semantic_matches sm ON m.id = sm.id
  LEFT JOIN keyword_matches km ON m.id = km.id
  WHERE sm.id IS NOT NULL OR km.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- Recreate match_memories at 1024 dims with multi-tenant support
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1024),
  match_threshold FLOAT,
  match_count     INT,
  user_id_arg     UUID
)
RETURNS TABLE (
  id              UUID,
  platform        TEXT,
  title           TEXT,
  content         TEXT,
  event_timestamp TIMESTAMPTZ,
  similarity      FLOAT
)
LANGUAGE sql
AS $$
  SELECT
    m.id,
    m.platform,
    m.title,
    m.content,
    m.timestamp  AS event_timestamp,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
  FROM memories m
  WHERE (m.user_id = user_id_arg OR (m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg) AND m.scope = 'organizational'))
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION hybrid_search TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_memories TO authenticated, service_role;

-- ============================================================================
-- COGNITIVE GRAPH MULTI-TENANCY RLS
-- ============================================================================

-- Enable RLS on chronic_nodes and chronic_edges
ALTER TABLE public.chronic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronic_edges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid duplicates
DROP POLICY IF EXISTS "Users can view their own chronic nodes" ON public.chronic_nodes;
DROP POLICY IF EXISTS "Admins can view organization chronic nodes" ON public.chronic_nodes;
DROP POLICY IF EXISTS "Users can view their own chronic edges" ON public.chronic_edges;
DROP POLICY IF EXISTS "Admins can view organization-scoped chronic edges" ON public.chronic_edges;

-- Create policies for chronic_nodes
CREATE POLICY "Users can view their own chronic nodes" ON public.chronic_nodes
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view organization chronic nodes" ON public.chronic_nodes
FOR SELECT USING (
  user_id IN (
    SELECT user_id 
    FROM public.organization_members 
    WHERE organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  )
);

-- Create policies for chronic_edges
CREATE POLICY "Users can view their own chronic edges" ON public.chronic_edges
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view organization-scoped chronic edges" ON public.chronic_edges
FOR SELECT USING (
  source_memory_id IN (
    SELECT id FROM public.memories 
    WHERE scope = 'organizational' 
      AND organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  )
);

-- ============================================================================
-- ALERTS MULTI-TENANCY RLS
-- ============================================================================

-- Enable RLS on alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Drop existing alerts policies to avoid duplicates
DROP POLICY IF EXISTS "Users can only see their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users can view their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Admins can view organization-scoped alerts" ON public.alerts;

-- Create policies for alerts
CREATE POLICY "Users can view their own alerts" ON public.alerts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view organization-scoped alerts" ON public.alerts
FOR SELECT USING (
  source_memory_id IN (
    SELECT id FROM public.memories 
    WHERE scope = 'organizational' 
      AND organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  )
);
