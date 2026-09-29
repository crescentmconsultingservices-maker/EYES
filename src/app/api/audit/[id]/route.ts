import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * API Route to check the status of a specific Reputation Audit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cleanId = id.trim().toLowerCase();
    let query = supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', user.id);

    if (cleanId.length === 8) {
      query = query.like('id', `${cleanId}%`);
    } else {
      query = query.eq('id', cleanId);
    }

    const { data: audit, error: fetchError } = await query.maybeSingle();

    if (fetchError || !audit) {
      return NextResponse.json({ error: 'Audit not found or access denied.' }, { status: 404 });
    }


    // Query any lenses already generated for this audit
    const { data: lensesData } = await supabase
      .from('audit_lenses')
      .select('*')
      .eq('audit_id', audit.id);

    const lenses: Record<string, any> = {};
    if (lensesData && lensesData.length > 0) {
      for (const row of lensesData) {
        const norm = row.lens_type === 'reputation' ? 'investor' : row.lens_type;
        lenses[norm] = {
          id: row.id,
          auditId: row.audit_id,
          lensType: norm,
          riskScore: Number(row.risk_score || 0),
          narrative: row.narrative || '',
          metadata: row.metadata || {},
          generatedAt: row.generated_at,
        };
      }
    }

    // Map DB fields to camelCase for the frontend
    const mappedAudit = {
      id: audit.id,
      status: audit.status,
      stage: audit.stage || audit.status,
      riskScore: Number(audit.risk_score || 0),
      mentionsCount: audit.mentions_count || 0,
      commitmentsCount: audit.commitments_count || 0,
      summaryNarrative: audit.summary_narrative,
      connectorsCovered: audit.connectors_covered || [],
      reportUrl: audit.report_url,
      createdAt: audit.created_at,
      extractedFindings: audit.extracted_findings || {},
      lenses,
      metadata: audit.metadata || {}
    };

    return NextResponse.json(mappedAudit);

  } catch (err) {
    console.error('[Audit Status API] Failure:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
