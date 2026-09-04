import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { InviteAcceptSchema, validateBody } from '@/lib/validations';

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

    // Find and validate the invitation token
    const { data: invitation, error: inviteErr } = await supabase
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
    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
      });

    if (memberErr) {
      // Check if they are already a member
      if (memberErr.code === '23505') { // unique violation
        return NextResponse.json({ error: 'You are already a member of this organization' }, { status: 400 });
      }
      console.error('Error adding organization member:', memberErr);
      return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    // Update user profile account type and organization mapping
    const { error: profileErr } = await supabase
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

    // Mark invitation as accepted
    await supabase
      .from('organization_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    return NextResponse.json({
      success: true,
      organizationId: invitation.organization_id,
      role: invitation.role,
    });
  } catch (err) {
    console.error('Accept Invite API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
