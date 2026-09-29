import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { AuditLensService } from '@/services/audit/lens-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit/[id]/lens?type=investor
 * Checks if an audit_lenses row exists for this audit + lens type.
 * - Yes: returns it immediately (no AI call)
 * - No: runs one cheap AI call using extracted_findings, saves to audit_lenses, returns it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Audit ID is required.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get('type') || searchParams.get('lens') || 'full';

    // 1. Authenticate user
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch or generate lens on demand
    const lens = await AuditLensService.getOrCreateLens(id, rawType, user.id);

    return NextResponse.json({
      success: true,
      lens,
    });
  } catch (err) {
    console.error('[Audit Lens API] Failed:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to retrieve or generate lens.',
    }, { status: 500 });
  }
}
