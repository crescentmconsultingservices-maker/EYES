import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit/company/[orgId]
 * Org admin endpoint for company view.
 * Shows only consented users, only granted lens types, at summary-level only.
 * Deliberately excludes raw flagged content, raw citations, or raw memories for privacy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = await createAdminClient();

    // 1. Verify user is an active member or admin of this organization
    const { data: membership, error: memError } = await adminSupabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: 'Access denied: not an organization member' }, { status: 403 });
    }

    // 2. Fetch active consent grants for this organization
    const { data: grants, error: grantsError } = await adminSupabase
      .from('audit_consent_grants')
      .select('id, subject_user_id, scope, granted_at')
      .eq('organization_id', orgId)
      .is('revoked_at', null);

    if (grantsError || !grants || grants.length === 0) {
      return NextResponse.json({ consentedMembers: [] });
    }

    const consentedMembers = [];

    for (const grant of grants) {
      // Fetch latest completed audit for this subject
      const { data: latestAudit } = await adminSupabase
        .from('reputation_audits')
        .select('id, risk_score, mentions_count, commitments_count, summary_narrative, connectors_covered, created_at, metadata')
        .eq('user_id', grant.subject_user_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestAudit) continue;

      // Fetch all generated lenses for this audit
      const { data: lenses } = await adminSupabase
        .from('audit_lenses')
        .select('lens_type, risk_score, narrative, generated_at')
        .eq('audit_id', latestAudit.id);

      // Filter lenses to ONLY what is granted in scope
      const allowedScope = grant.scope || ['full'];
      const filteredLenses: Record<string, any> = {};

      if (lenses) {
        for (const l of lenses) {
          const norm = l.lens_type === 'reputation' ? 'investor' : l.lens_type;
          if (allowedScope.includes(norm) || allowedScope.includes('all')) {
            filteredLenses[norm] = {
              lensType: norm,
              riskScore: Number(l.risk_score || 0),
              narrative: l.narrative,
              generatedAt: l.generated_at,
            };
          }
        }
      }

      // Summary-level metrics ONLY — absolutely NO raw flagged memories, no raw evidence
      consentedMembers.push({
        subjectUserId: grant.subject_user_id,
        grantedScope: grant.scope,
        grantedAt: grant.granted_at,
        audit: {
          id: latestAudit.id,
          createdAt: latestAudit.created_at,
          overallRiskScore: Number(latestAudit.risk_score || 0),
          mentionsScanned: latestAudit.mentions_count || 0,
          pendingCommitments: latestAudit.commitments_count || 0,
          complianceRate: (latestAudit.metadata as any)?.complianceRate || '100.00',
          trajectory: (latestAudit.metadata as any)?.trajectory || 'stable',
          connectorsCovered: latestAudit.connectors_covered || [],
          lenses: filteredLenses,
        }
      });
    }

    return NextResponse.json({ consentedMembers });
  } catch (err) {
    console.error('[Company Audit API] Error:', err);
    return NextResponse.json({ error: 'Failed to retrieve consented audits' }, { status: 500 });
  }
}
