-- Create Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    corporate_domain TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
