import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const assignedRole = role || 'member';
    if (!['owner', 'admin', 'member'].includes(assignedRole)) {
      return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    // Find the current user's organization context
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json({ error: 'User does not belong to any organization' }, { status: 403 });
    }

    // Verify user has admin/owner permissions in the organization
    const { data: membership, error: membershipErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', profile.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipErr || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin or Owner privileges required' }, { status: 403 });
    }

    // Generate secure unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Invite link active for 7 days

    const { data: invitation, error: inviteErr } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: profile.organization_id,
        email,
        role: assignedRole,
        token,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, token, email, role')
      .single();

    if (inviteErr || !invitation) {
      console.error('Error creating invitation:', inviteErr);
      return NextResponse.json({ error: 'Failed to create organization invitation' }, { status: 500 });
    }

    // Build the invite URL
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/signup?invite=${token}`;

    return NextResponse.json({
      success: true,
      inviteUrl,
      invitation,
    });
  } catch (err) {
    console.error('Organization Invite API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    // Find the invitation
    const { data: invitation, error: inviteErr } = await supabase
      .from('organization_invitations')
      .select('organization_id')
      .eq('id', id)
      .maybeSingle();

    if (inviteErr || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Verify user is owner/admin of that organization
    const { data: membership, error: membershipErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipErr || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin or Owner privileges required' }, { status: 403 });
    }

    // Delete the invitation
    const { error: deleteErr } = await supabase
      .from('organization_invitations')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      console.error('Error deleting invitation:', deleteErr);
      return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Revoke Invite API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
