-- ============================================================================
-- 057: FIX ORGANIZATION MULTI-TENANCY LOGIC
-- ============================================================================

-- 1. Create secure, non-recursive helper functions to check membership
-- (Using SECURITY DEFINER prevents infinite recursion on RLS policies)
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = org_id 
          AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = org_id 
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
    );
$$;

-- 2. Fix the "Invisible Team" Flaw (Organization Members RLS)
-- Drop the overly restrictive policy that hid employees from admins
DROP POLICY IF EXISTS "Users can view their own membership" ON public.organization_members;
DROP POLICY IF EXISTS "Members can view organization memberships" ON public.organization_members;

-- Allow any member of an organization to see who else is in the organization
CREATE POLICY "Members can view everyone in their organizations" ON public.organization_members
FOR SELECT USING (
    public.is_org_member(organization_id)
);


-- 3. Fix the "Blind Employee" Flaw (Memories RLS)
DROP POLICY IF EXISTS "Admins can view organization-scoped memories" ON public.memories;

-- Now ALL members of the organization can view company data (the Company IRIS)
CREATE POLICY "Members can view organization-scoped memories" ON public.memories
FOR SELECT USING (
    scope = 'organizational' 
    AND public.is_org_member(organization_id)
);


-- 4. Fix the "Data Forgery" Flaw (Memories and OAuth Tokens INSERT Policies)

-- A. Memories
DROP POLICY IF EXISTS "Users can insert their own memories" ON public.memories;

CREATE POLICY "Users can insert personal or their organization memories" ON public.memories
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR 
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- B. OAuth Tokens
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.oauth_tokens;
DROP POLICY IF EXISTS "Users can insert personal or organization tokens" ON public.oauth_tokens;

CREATE POLICY "Users can insert personal or organization tokens" ON public.oauth_tokens
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR 
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);


-- 5. Harden the Search Functions (hybrid_search & match_memories)
-- Update the WHERE clause to explicitly verify the user is actually a member of the active organization they are searching

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
    WHERE (
        (m.scope = 'personal' AND m.user_id = user_id_arg) 
        OR 
        (m.scope = 'organizational' 
         AND m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg)
         AND EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = m.organization_id AND user_id = user_id_arg)
        )
      )
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
    WHERE (
        (m.scope = 'personal' AND m.user_id = user_id_arg) 
        OR 
        (m.scope = 'organizational' 
         AND m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg)
         AND EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = m.organization_id AND user_id = user_id_arg)
        )
      )
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
  WHERE (
      (m.scope = 'personal' AND m.user_id = user_id_arg) 
      OR 
      (m.scope = 'organizational' 
       AND m.organization_id = (SELECT organization_id FROM public.user_profiles WHERE user_id = user_id_arg)
       AND EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = m.organization_id AND user_id = user_id_arg)
      )
    )
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
