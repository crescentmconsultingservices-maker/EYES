import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidSpotifyToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeSpotifySync(actor: SyncActor, mode: string = 'delta') {
  const { supabase, userId, userEmail, userName } = actor;

  const { data: currentStatus } = await supabase
    .from('sync_status')
    .select('cursor, total_items, last_sync_at')
    .eq('user_id', userId)
    .eq('platform', 'spotify')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidSpotifyToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Spotify authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Spotify is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const beforeTime = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'spotify',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50${beforeTime ? `&before=${beforeTime}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Spotify recently played' };
  }

  const payload = await response.json();
  const items = payload.items || [];
  const nextCursor = payload.cursors?.before || null;
  const hasMore = !!nextCursor;

  const rawEvents = items.map((item: any) => {
    const track = item.track;
    const artists = track.artists.map((a: any) => a.name).join(', ');
    return {
      user_id: userId,
      platform: 'spotify',
      platform_id: String(item.played_at),
      event_type: 'song_played',
      title: `${track.name} by ${artists}`,
      content: `Listened to ${track.name} by ${artists} from the album ${track.album.name}. Duration: ${Math.round(track.duration_ms / 1000)}s.`,
      author: userEmail || userName || 'Spotify User',
      timestamp: new Date(item.played_at).toISOString(),
      scope: 'personal',
      organization_id: null,
      metadata: {
        track_id: track.id,
        artists: artists,
        album: track.album.name,
        popularity: track.popularity,
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
      platform: 'spotify',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextCursor) : null,
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
        platform: 'spotify',
        mode: 'backfill',
        cursor: String(nextCursor),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Spotify Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
