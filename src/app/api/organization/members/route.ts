import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let memberId = searchParams.get('memberId') || searchParams.get('id');
    let targetUserId = searchParams.get('userId');

    // Also check body if not in query
    if (!memberId && !targetUserId) {
      try {
        const body = await request.json();
        memberId = body?.memberId || body?.id;
        targetUserId = body?.userId;
      } catch {
        // Body was empty, proceed with query params
      }
    }

    if (!memberId && !targetUserId) {
      return NextResponse.json({ error: 'memberId or userId is required' }, { status: 400 });
    }

    const adminSupabase = getAdminClient();

    // 1. Fetch current requester's profile and organization context
    const { data: requesterProfile } = await adminSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let orgId = requesterProfile?.organization_id;

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

    // 2. Fetch requester's role in the organization
    const { data: requesterMembership } = await adminSupabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!requesterMembership) {
      return NextResponse.json({ error: 'Forbidden: You are not a member of this organization' }, { status: 403 });
    }

    // 3. Fetch target member
    let targetQuery = adminSupabase
      .from('organization_members')
      .select('id, user_id, organization_id, role')
      .eq('organization_id', orgId);

    if (memberId) {
      targetQuery = targetQuery.eq('id', memberId);
    } else if (targetUserId) {
      targetQuery = targetQuery.eq('user_id', targetUserId);
    }

    const { data: targetMember, error: targetErr } = await targetQuery.maybeSingle();

    if (targetErr || !targetMember) {
      return NextResponse.json({ error: 'Member not found in this organization' }, { status: 404 });
    }

    const isSelf = targetMember.user_id === user.id;

    // 4. Role-based permission checks
    if (targetMember.role === 'owner') {
      return NextResponse.json({
        error: 'Cannot remove the workspace owner. Ownership must be transferred first.',
      }, { status: 403 });
    }

    // If removing someone else, requester must be owner or admin
    if (!isSelf) {
      if (!['owner', 'admin'].includes(requesterMembership.role)) {
        return NextResponse.json({
          error: 'Forbidden: Only owners and admins can remove members',
        }, { status: 403 });
      }

      // Admins cannot remove other admins or owners
      if (requesterMembership.role === 'admin' && ['admin', 'owner'].includes(targetMember.role)) {
        return NextResponse.json({
          error: 'Forbidden: Only the workspace owner can remove administrators',
        }, { status: 403 });
      }
    }

    // 5. Delete member from organization_members
    const { error: deleteErr } = await adminSupabase
      .from('organization_members')
      .delete()
      .eq('id', targetMember.id);

    if (deleteErr) {
      console.error('Error removing organization member:', deleteErr);
      return NextResponse.json({ error: 'Failed to remove member from workspace' }, { status: 500 });
    }

    // 6. Reset target user's user_profile organization_id & account_type
    await adminSupabase
      .from('user_profiles')
      .update({
        organization_id: null,
        account_type: 'individual',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', targetMember.user_id)
      .eq('organization_id', orgId);

    return NextResponse.json({
      success: true,
      message: isSelf ? 'Successfully left the workspace' : 'Member successfully removed from workspace',
    });
  } catch (err) {
    console.error('Remove Member API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
