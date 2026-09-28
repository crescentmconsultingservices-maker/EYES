import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidCanvaToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeCanvaSync(actor: SyncActor, mode: string = 'delta') {
  const { supabase, userId, userEmail, userName } = actor;

  const { data: currentStatus } = await supabase
    .from('sync_status')
    .select('cursor, total_items, last_sync_at')
    .eq('user_id', userId)
    .eq('platform', 'canva')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidCanvaToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Canva authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Canva is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const continuation = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'canva',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://api.canva.com/rest/v1/designs${continuation ? `?continuation=${continuation}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Canva designs' };
  }

  const payload = await response.json();
  const designs = payload.items || [];
  const nextContinuation = payload.continuation || null;
  const hasMore = !!nextContinuation;

  const rawEvents = designs.map((design: any) => {
    return {
      user_id: userId,
      platform: 'canva',
      platform_id: String(design.id),
      event_type: 'design',
      title: design.title || 'Untitled Design',
      content: `Canva Design: ${design.title}\nURL: ${design.urls?.edit_url || 'N/A'}`,
      author: userEmail || userName || 'Canva User',
      timestamp: new Date(design.updated_at || Date.now()).toISOString(),
      scope: 'personal',
      organization_id: null,
      metadata: {
        id: design.id,
        url: design.urls?.edit_url,
        thumbnail: design.thumbnail?.url,
      },
      is_flagged: false,
      flag_severity: 'none',
      flag_reason: null,
    };
  });

  if (rawEvents.length > 0) {
    await upsertRawEventsSafely(supabase, rawEvents);
  }

  const now = new Date().toISOString();
  await Promise.all([
    upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'canva',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextContinuation) : null,
      error_message: null,
    }),
    supabase.from('user_profiles').update({
      memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
      updated_at: now,
    }).eq('user_id', userId),
  ]);

  if (hasMore && isBackfill) {
    try {
      const { dispatchNextSyncJob } = await import('@/services/sync/queue-dispatcher');
      await dispatchNextSyncJob({
        userId,
        platform: 'canva',
        mode: 'backfill',
        cursor: String(nextContinuation),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Canva Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
