-- Enable DELETE policy on organization_invitations for organization admins & owners
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.organization_invitations;

CREATE POLICY "Admins can delete invitations" ON public.organization_invitations
FOR DELETE
USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
    )
);
