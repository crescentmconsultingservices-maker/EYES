import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { inngest } from '@/services/inngest/client';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';

/**
 * POST /api/audit/create
 * Initiates a Reputation Audit.
 * - Authenticates the logged in user
 * - Creates reputation_audits row with status = 'pending'
 * - Hands off to background worker (Inngest)
 */
export async function POST(_request: Request) {
  try {
    // 1. Authenticate user session
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      console.warn('[Audit API] Unauthorized attempt detected.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Audit API] Initiating audit for User: ${user.id}`);

    // 2. Create the pending audit record in reputation_audits
    const supabase = await createAdminClient();
    const { data: audit, error: createError } = await supabase
      .from('reputation_audits')
      .insert({
        user_id: user.id,
        status: 'pending',
        stage: 'pending',
        metadata: { audit_type: 'full' }
      })
      .select()
      .single();

    if (createError || !audit) {
      console.error('[Audit API] Database Insert Failed:', createError);
      return NextResponse.json({ error: 'Failed to create audit record' }, { status: 500 });
    }

    console.log(`[Audit API] Record Created: ${audit.id}. Handing off to Inngest background worker...`);

    // 3. Hand off to Inngest background worker
    try {
      await inngest.send({
        name: 'audit/reputation.run',
        data: {
          auditId: audit.id,
          userId: user.id,
        },
      });
    } catch (inngestErr) {
      console.warn('[Audit API] Inngest dispatch unavailable (running asynchronous direct worker):', inngestErr);
      // Fallback for local development if Inngest CLI daemon is not active
      AuditAnalysisService.runAnalysis(audit.id, user.id).catch((err) => {
        console.error('[Audit API] Asynchronous worker error:', err);
      });
    }

    return NextResponse.json({
      success: true,
      auditId: audit.id,
      status: 'pending',
      stage: 'pending',
      message: 'Reputation audit initiated successfully.'
    });

  } catch (err) {
    console.error('[Audit API] Fatal error:', err);
    return NextResponse.json({ 
      error: 'Execution failed.', 
      detail: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
