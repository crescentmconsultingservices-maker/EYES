-- ============================================================================
-- 058: PROPAGATE ORGANIZATIONAL SCOPE TO ALL IRIS TABLES
-- ============================================================================

-- 1. ADD SCOPE & ORGANIZATION_ID COLUMNS TO ALL DOWNSTREAM TABLES
ALTER TABLE public.chronic_nodes 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

ALTER TABLE public.chronic_edges 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

ALTER TABLE public.insights 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

ALTER TABLE public.action_queue 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

ALTER TABLE public.chat_threads 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

ALTER TABLE public.alerts 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organizational'));

-- Create Indexes for performance on these new columns
CREATE INDEX IF NOT EXISTS idx_chronic_nodes_org_scope ON public.chronic_nodes(organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_chronic_edges_org_scope ON public.chronic_edges(organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_insights_org_scope ON public.insights(organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_action_queue_org_scope ON public.action_queue(organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_chat_threads_org_scope ON public.chat_threads(organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_alerts_org_scope ON public.alerts(organization_id, scope);


-- ============================================================================
-- 2. APPLY STRICT ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- We use the public.is_org_member(UUID) function created in the previous migration

-- ----------------------------------------------------------------------------
-- A. CHRONIC_NODES
-- ----------------------------------------------------------------------------
ALTER TABLE public.chronic_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own chronic nodes" ON public.chronic_nodes;
DROP POLICY IF EXISTS "Admins can view organization chronic nodes" ON public.chronic_nodes;

CREATE POLICY "View personal or organization nodes" ON public.chronic_nodes
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization nodes" ON public.chronic_nodes
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- ----------------------------------------------------------------------------
-- B. CHRONIC_EDGES
-- ----------------------------------------------------------------------------
ALTER TABLE public.chronic_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own chronic edges" ON public.chronic_edges;
DROP POLICY IF EXISTS "Admins can view organization-scoped chronic edges" ON public.chronic_edges;

CREATE POLICY "View personal or organization edges" ON public.chronic_edges
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization edges" ON public.chronic_edges
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- ----------------------------------------------------------------------------
-- C. INSIGHTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own insights" ON public.insights;

CREATE POLICY "View personal or organization insights" ON public.insights
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization insights" ON public.insights
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

CREATE POLICY "Update personal or organization insights" ON public.insights
FOR UPDATE USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
) WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- ----------------------------------------------------------------------------
-- D. ACTION_QUEUE
-- ----------------------------------------------------------------------------
ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own actions" ON public.action_queue;
DROP POLICY IF EXISTS "Users can update their own actions" ON public.action_queue;

CREATE POLICY "View personal or organization actions" ON public.action_queue
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization actions" ON public.action_queue
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

CREATE POLICY "Update personal or organization actions" ON public.action_queue
FOR UPDATE USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
) WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- ----------------------------------------------------------------------------
-- E. CHAT_THREADS
-- ----------------------------------------------------------------------------
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own threads" ON public.chat_threads;

CREATE POLICY "View personal or organization threads" ON public.chat_threads
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization threads" ON public.chat_threads
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

CREATE POLICY "Update personal or organization threads" ON public.chat_threads
FOR UPDATE USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
) WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);

-- ----------------------------------------------------------------------------
-- F. ALERTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Admins can view organization-scoped alerts" ON public.alerts;

CREATE POLICY "View personal or organization alerts" ON public.alerts
FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid()) OR
    (scope = 'organizational' AND public.is_org_member(organization_id))
);

CREATE POLICY "Insert personal or organization alerts" ON public.alerts
FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        (scope = 'personal') OR
        (scope = 'organizational' AND public.is_org_member(organization_id))
    )
);
