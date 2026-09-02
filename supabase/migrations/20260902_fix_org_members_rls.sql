-- Fix RLS Infinite Recursion on organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can insert organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view members of their organization" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON public.organization_members;

-- Direct non-recursive policy: users can read rows matching their own auth.uid()
CREATE POLICY "Users can view their own membership" ON public.organization_members
FOR SELECT USING (user_id = auth.uid());
