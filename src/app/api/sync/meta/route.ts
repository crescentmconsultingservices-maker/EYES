import { NextRequest, NextResponse } from 'next/server';
import { resolveSyncActor, type SyncActor, type SyncActorError } from '@/utils/sync/actor';
import { executeMetaSync } from '@/services/sync/meta-service';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let actor: SyncActor | SyncActorError | null = null;
  try {
    actor = await resolveSyncActor(req);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || (searchParams.get('backfill') === 'true' ? 'backfill' : 'delta');

    const result = await executeMetaSync(actor, mode);
    if (result.status !== 200) {
      return NextResponse.json(
        { error: result.error, detail: result.detail },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[Meta Route Fatal Error]:', err);

    if (actor && 'supabase' in actor) {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'meta',
        status: 'error',
        error_message: detail.slice(0, 200),
      });
    }

    return NextResponse.json({ error: 'Sync failed', detail }, { status: 500 });
  }
}
