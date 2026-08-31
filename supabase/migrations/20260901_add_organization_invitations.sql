-- Create Organization Invitations Table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    token TEXT NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Drop policies to prevent conflicts
DROP POLICY IF EXISTS "Admins can view invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Users can read invitations by token" ON public.organization_invitations;

-- Create RLS Policies
CREATE POLICY "Admins can view invitations" ON public.organization_invitations
FOR SELECT USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

CREATE POLICY "Admins can create invitations" ON public.organization_invitations
FOR INSERT WITH CHECK (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

CREATE POLICY "Admins can update invitations" ON public.organization_invitations
FOR UPDATE USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
) WITH CHECK (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

-- Anyone can select an invitation if they have the token (needed during the accept invite flow before being an org member)
CREATE POLICY "Users can read invitations by token" ON public.organization_invitations
FOR SELECT USING (true);

-- ============================================================================
-- ORGANIZATIONS & MEMBERS RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Policies for public.organizations
DROP POLICY IF EXISTS "Enable insert access for all authenticated users" ON public.organizations;
CREATE POLICY "Enable insert access for all authenticated users" ON public.organizations
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Members can view their own organizations" ON public.organizations;
CREATE POLICY "Members can view their own organizations" ON public.organizations
FOR SELECT USING (
    id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Owners and admins can update their organizations" ON public.organizations;
CREATE POLICY "Owners and admins can update their organizations" ON public.organizations
FOR UPDATE USING (
    id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
) WITH CHECK (
    id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

-- Policies for public.organization_members
DROP POLICY IF EXISTS "Enable insert access for members themselves" ON public.organization_members;
CREATE POLICY "Enable insert access for members themselves" ON public.organization_members
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can view organization memberships" ON public.organization_members;
CREATE POLICY "Members can view organization memberships" ON public.organization_members
FOR SELECT USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Owners and admins can update memberships" ON public.organization_members;
CREATE POLICY "Owners and admins can update memberships" ON public.organization_members
FOR UPDATE USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
) WITH CHECK (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

DROP POLICY IF EXISTS "Owners and admins can delete memberships" ON public.organization_members;
CREATE POLICY "Owners and admins can delete memberships" ON public.organization_members
FOR DELETE USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);

