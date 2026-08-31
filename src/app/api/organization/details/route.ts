import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find the user's profile organization context
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json({ error: 'User does not belong to any organization' }, { status: 403 });
    }

    const orgId = profile.organization_id;

    // Fetch organization info
    const { data: organization, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgErr || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch members
    const { data: members, error: membersErr } = await supabase
      .from('organization_members')
      .select('id, user_id, role, joined_at')
      .eq('organization_id', orgId);

    let membersWithProfile = [];
    if (members && members.length > 0) {
      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_profiles')
        .select('user_id, name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      membersWithProfile = members.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || { name: 'Unknown User', avatar: 'U' }
      }));
    }

    // Fetch invitations
    const { data: invitations, error: inviteErr } = await supabase
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      organization,
      members: membersWithProfile,
      invitations: invitations || [],
    });
  } catch (err) {
    console.error('Organization Details API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, privacyShieldEnabled } = await request.json();

    // Find the user's profile organization context
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json({ error: 'User does not belong to any organization' }, { status: 403 });
    }

    const orgId = profile.organization_id;

    // Verify user is owner/admin of that organization
    const { data: membership, error: membershipErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipErr || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin or Owner privileges required' }, { status: 403 });
    }

    const updates: { name?: string; privacy_shield_enabled?: boolean } = {};
    if (name !== undefined) updates.name = name;
    if (privacyShieldEnabled !== undefined) updates.privacy_shield_enabled = privacyShieldEnabled;

    const { data: updatedOrg, error: updateErr } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (updateErr || !updatedOrg) {
      console.error('Error updating organization:', updateErr);
      return NextResponse.json({ error: 'Failed to update organization details' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      organization: updatedOrg,
    });
  } catch (err) {
    console.error('Organization Update API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
