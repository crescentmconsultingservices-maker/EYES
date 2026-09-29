-- ============================================================
-- EYES Migration 066: Fix organization_invitations RLS Policy
--
-- Security Fix:
-- Drops the insecure "Users can read invitations by token" policy
-- which used 'USING (true)' without a role or token filter, allowing
-- any authenticated user to inspect all pending invitations, emails,
-- and invite tokens across all organizations.
-- ============================================================

-- 1. Drop the blanket USING (true) policy
DROP POLICY IF EXISTS "Users can read invitations by token" ON public.organization_invitations;

-- 2. Explicit full access for service_role (used by server endpoints like /api/organization/invite/accept)
DROP POLICY IF EXISTS "Service role full access on invitations" ON public.organization_invitations;
CREATE POLICY "Service role full access on invitations"
  ON public.organization_invitations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Scope authenticated user reads strictly to their own email address
DROP POLICY IF EXISTS "Users can view invitations for their email" ON public.organization_invitations;
CREATE POLICY "Users can view invitations for their email"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 4. Ensure org admins & owners can view their organization's invitations
DROP POLICY IF EXISTS "Admins can view invitations" ON public.organization_invitations;
CREATE POLICY "Admins can view invitations"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  );
