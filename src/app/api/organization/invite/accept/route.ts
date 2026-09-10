import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { InviteAcceptSchema, validateBody } from '@/lib/validations';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawBody = await request.json();
    const validation = validateBody(InviteAcceptSchema, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { token } = validation.data;

    const adminSupabase = getAdminClient();

    // Find and validate the invitation token
    const { data: invitation, error: inviteErr } = await adminSupabase
      .from('organization_invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr || !invitation) {
      return NextResponse.json({ error: 'Invalid or non-existent invitation token' }, { status: 400 });
    }

    if (invitation.accepted_at) {
      return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 400 });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invitation token has expired' }, { status: 400 });
    }

    // Establish organization membership
    const { error: memberErr } = await adminSupabase
      .from('organization_members')
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
      });

    if (memberErr) {
      // Check if they are already a member
      if (memberErr.code === '23505') { // unique violation
        // Clean up invitation since they are already a member
        await adminSupabase.from('organization_invitations').delete().eq('id', invitation.id);
        return NextResponse.json({ error: 'You are already a member of this organization' }, { status: 400 });
      }
      console.error('Error adding organization member:', memberErr);
      return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    // Update user profile account type and organization mapping
    const { error: profileErr } = await adminSupabase
      .from('user_profiles')
      .update({
        account_type: 'organization',
        organization_id: invitation.organization_id,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (profileErr) {
      console.error('Error updating user profile:', profileErr);
      return NextResponse.json({ error: 'Failed to update user profile organization link' }, { status: 500 });
    }

    // Delete the consumed invitation so it no longer appears in pending list
    await adminSupabase
      .from('organization_invitations')
      .delete()
      .eq('id', invitation.id);

    // Fetch organization name for IRIS briefing
    const { data: orgData } = await adminSupabase
      .from('organizations')
      .select('name')
      .eq('id', invitation.organization_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      organizationId: invitation.organization_id,
      organizationName: orgData?.name || 'Workspace',
      role: invitation.role,
    });
  } catch (err) {
    console.error('Accept Invite API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
