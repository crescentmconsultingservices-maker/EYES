import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit/consent
 * Returns all active consent grants for the authenticated subject user.
 *
 * POST /api/audit/consent
 * Creates or updates a consent grant for an organization.
 * Body: { organizationId, scope: ['full', 'investor', 'hiring', 'behavioral'], revoked?: boolean }
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: grants, error } = await supabase
      .from('audit_consent_grants')
      .select('*')
      .eq('subject_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ grants: grants || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch consent grants' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, scope = ['full'], revoke = false } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    if (revoke) {
      // Revoke existing active grant
      const { data, error } = await supabase
        .from('audit_consent_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('subject_user_id', user.id)
        .eq('organization_id', organizationId)
        .select();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, revoked: true, data });
    }

    // Insert or update grant
    const { data, error } = await supabase
      .from('audit_consent_grants')
      .insert({
        subject_user_id: user.id,
        organization_id: organizationId,
        scope,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, grant: data });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update consent grant' }, { status: 500 });
  }
}
