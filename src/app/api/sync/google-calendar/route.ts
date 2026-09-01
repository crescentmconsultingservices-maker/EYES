import { NextResponse } from 'next/server';
import { resolveSyncActor, type SyncActor, type SyncActorError } from '@/utils/sync/actor';
import { executeGoogleCalendarSync } from '@/services/sync/google-calendar-service';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';

export async function POST(request: Request) {
  let actor: SyncActor | SyncActorError | null = null;
  try {
    actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('depth') === 'deep' ? 'backfill' : 'delta';

    const result = await executeGoogleCalendarSync(actor, mode);

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('google-calendar sync wrapper error:', error);

    if (actor && 'supabase' in actor) {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'google-calendar',
        status: 'error',
        error_message: detail.slice(0, 200)
      });
    }

    return NextResponse.json(
      { error: 'Unable to sync Google Calendar data right now.', detail },
      { status: 500 }
    );
  }
}
