import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createAdminClient } from '@/utils/supabase/server';
import { syncProviders } from '@/services/sync/provider-registry';
import { type SyncActor } from '@/utils/sync/actor';

export const dynamic = 'force-dynamic';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function handler(request: Request) {
  try {
    const body = await request.json();
    const { userId, platform, mode, cursor } = body;

    if (!userId || !platform) {
      console.error('[Queue: Sync] Missing required parameters:', body);
      return NextResponse.json(
        { error: 'Missing userId or platform' },
        { status: 400 }
      );
    }

    if (!isUuid(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400 }
      );
    }

    const provider = syncProviders[platform];
    if (!provider) {
      console.error(`[Queue: Sync] Unsupported platform: ${platform}`);
      return NextResponse.json(
        { error: `Unsupported platform: ${platform}` },
        { status: 400 }
      );
    }

    console.log(
      `[Queue: Sync] Executing background sync for user ${userId} on platform ${platform} (mode: ${mode || 'backfill'})`
    );

    const supabase = await createAdminClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userData?.user) {
      console.error(`[Queue: Sync] User ${userId} not found:`, userError?.message);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actor: SyncActor = {
      supabase,
      userId,
      userEmail: userData.user.email ?? undefined,
      userName: (userData.user.user_metadata as { name?: string })?.name,
      mode: 'cron',
    };

    const result = await provider.executeSync(actor, mode || 'backfill');

    console.log(`[Queue: Sync] Completed sync for ${platform} (status: ${result.status})`);

    return NextResponse.json({
      success: result.status === 200,
      platform,
      data: result.data,
      error: result.error,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Queue: Sync] Processing error:', errorMsg);
    return NextResponse.json(
      { error: 'Queue sync processing failed', detail: errorMsg },
      { status: 500 }
    );
  }
}

// Only bypass QStash signature verification in explicit local development.
// In production, missing signing keys are a misconfiguration — return 500.
export async function POST(req: Request) {
  const isDev = process.env.NODE_ENV === 'development';
  const hasKeys =
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);

  if (isDev && !hasKeys) {
    // Local dev without QStash keys — bypass signature check
    return handler(req);
  }

  if (!hasKeys) {
    console.error('[Queue: Sync] QStash signing keys are not configured in production.');
    return new Response(
      JSON.stringify({ error: 'QStash signing keys not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const verifiedHandler = verifySignatureAppRouter(handler);
  return verifiedHandler(req);
}
