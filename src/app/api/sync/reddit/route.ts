import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { executeRedditSync } from '@/services/sync/reddit-service';

export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('depth') === 'deep' ? 'backfill' : 'delta';

    const result = await executeRedditSync(actor, mode);

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    console.error('reddit sync wrapper error:', error);
    return NextResponse.json({ error: 'Unable to sync reddit data right now.' }, { status: 500 });
  }
}
