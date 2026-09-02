import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 1. Find the user's profile organization context
    const { data: profile } = await adminSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let orgId = profile?.organization_id;

    // Fallback check in organization_members if user_profiles.organization_id is not synced
    if (!orgId) {
      const { data: memberRecord } = await adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberRecord) {
        orgId = memberRecord.organization_id;
        // Sync profile organization_id
        await adminSupabase
          .from('user_profiles')
          .update({ organization_id: orgId, account_type: 'organization' })
          .eq('user_id', user.id);
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: 'User does not belong to any organization' }, { status: 404 });
    }

    // 2. Fetch organization info
    const { data: organization, error: orgErr } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgErr || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // 3. Fetch members
    const { data: members } = await adminSupabase
      .from('organization_members')
      .select('id, user_id, role, joined_at')
      .eq('organization_id', orgId);

    let membersWithProfile: Array<{
      id: string;
      user_id: string;
      role: 'owner' | 'admin' | 'member';
      joined_at: string;
      profile: { name: string; avatar: string };
    }> = [];

    if (members && members.length > 0) {
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await adminSupabase
        .from('user_profiles')
        .select('user_id, name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      membersWithProfile = members.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || { name: 'Unknown User', avatar: 'U' }
      }));
    }

    // 4. Fetch invitations
    const { data: invitations } = await adminSupabase
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

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Find user profile or org member context
    const { data: profile } = await adminSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let orgId = profile?.organization_id;

    if (!orgId) {
      const { data: memberRecord } = await adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberRecord) orgId = memberRecord.organization_id;
    }

    if (!orgId) {
      return NextResponse.json({ error: 'User does not belong to any organization' }, { status: 403 });
    }

    // Verify admin / owner permissions
    const { data: member } = await adminSupabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions to update organization settings' }, { status: 403 });
    }

    const { data: updatedOrg, error: updateErr } = await adminSupabase
      .from('organizations')
      .update({
        ...(name ? { name: name.trim() } : {}),
        ...(typeof privacyShieldEnabled === 'boolean' ? { privacy_shield_enabled: privacyShieldEnabled } : {}),
      })
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, corporateDomain } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 1. Create Organization
    const { data: newOrg, error: createErr } = await adminSupabase
      .from('organizations')
      .insert({
        name: name.trim(),
        corporate_domain: corporateDomain?.trim() || null,
        privacy_shield_enabled: true,
      })
      .select()
      .single();

    if (createErr || !newOrg) {
      console.error('Error creating organization:', createErr);
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }

    // 2. Add current user as Owner
    const { error: memberErr } = await adminSupabase
      .from('organization_members')
      .upsert({
        organization_id: newOrg.id,
        user_id: user.id,
        role: 'owner',
      }, { onConflict: 'organization_id,user_id' });

    if (memberErr) {
      console.error('Error adding owner member:', memberErr);
      return NextResponse.json({ error: 'Failed to assign owner privileges' }, { status: 500 });
    }

    // 3. Link organization_id and account_type in user_profiles
    await adminSupabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        account_type: 'organization',
        organization_id: newOrg.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    return NextResponse.json({
      success: true,
      organization: newOrg,
    });
  } catch (err) {
    console.error('Organization Creation API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
