import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { PDFGenerationService } from '@/services/audit/pdf-generator';
import { ReputationAudit } from '@/types/dashboard';

// PDFKit uses Node.js streams — must run in Node.js runtime, not Edge.
export const runtime = 'nodejs';

/**
 * GET /api/audit/[id]/pdf
 * Full 9-page Reputation Audit Certificate — generated on-demand, streamed to browser.
 * Nothing stored in Supabase Storage for this path for GDPR privacy compliance.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    let userId = '';

    const authClient = await createClient();
    let user, authError;

    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]?.trim();
      const res = await authClient.auth.getUser(token);
      user = res.data.user;
      authError = res.error;
    } else {
      const res = await authClient.auth.getUser();
      user = res.data.user;
      authError = res.error;
    }

    if (authError || !user) {
      console.error('[PDF GET] Unauthorized. Error:', authError, 'User:', user ? 'exists' : 'missing');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const cleanId = id.trim().toLowerCase();
    console.log('[PDF GET] Querying for cleanId:', cleanId, 'userId:', userId);

    const supabaseAdmin = await createAdminClient();
    let query = supabaseAdmin
      .from('reputation_audits')
      .select('*')
      .eq('user_id', userId);

    if (cleanId.length === 8) {
      query = query.like('id', `${cleanId}%`);
    } else {
      query = query.eq('id', cleanId);
    }

    const { data: audit, error: fetchError } = await query.maybeSingle();

    if (fetchError || !audit || audit.status !== 'completed') {
      console.error('[PDF GET] Audit validation failed details:',
        'fetchError:', fetchError?.message || fetchError,
        'auditFound:', !!audit,
        'auditStatus:', audit?.status,
        'auditUserId:', audit?.user_id,
        'requestUserId:', userId
      );
      return NextResponse.json({ error: 'Audit not found or not yet completed.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const targetLens = searchParams.get('lens') || searchParams.get('type') || 'full';

    // Fetch or generate the requested lens on demand
    let lensRiskScore = Number(audit.risk_score || 0);
    let lensNarrative = audit.summary_narrative || '';
    let lensMetadata = audit.metadata || {};

    try {
      const { AuditLensService } = await import('@/services/audit/lens-service');
      const lens = await AuditLensService.getOrCreateLens(audit.id, targetLens, userId);
      if (lens) {
        lensRiskScore = lens.riskScore;
        lensNarrative = lens.narrative;
        lensMetadata = {
          ...lensMetadata,
          audit_type: lens.lensType,
        };
      }
    } catch (lensErr) {
      console.warn('[PDF GET] Error fetching/generating lens for PDF, falling back to base audit:', lensErr);
    }

    // Map DB fields to camelCase ReputationAudit type
    const mappedAudit: ReputationAudit = {
      id: audit.id,
      status: audit.status,
      riskScore: lensRiskScore,
      mentionsCount: audit.mentions_count || 0,
      commitmentsCount: audit.commitments_count || 0,
      summaryNarrative: lensNarrative,
      connectorsCovered: audit.connectors_covered || [],
      reportUrl: null,
      createdAt: audit.created_at,
      metadata: {
        ...lensMetadata,
        audit_type: targetLens,
      }
    };

    // Generate PDF in-memory buffer via shared PDFGenerationService
    const pdfBuffer = await PDFGenerationService.generateBuffer(mappedAudit, userId);

    const shortId = audit.id.slice(0, 8).toUpperCase();
    const filename = `eyes-audit-${targetLens}-${shortId}.pdf`;

    console.log(`[PDF GET] Generated booklet buffer: ${pdfBuffer.length} bytes | Filename: ${filename}`);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (err) {
    console.error('[PDF On-Demand] Failed:', err);
    return NextResponse.json({ error: 'PDF generation failed.' }, { status: 500 });
  }
}
