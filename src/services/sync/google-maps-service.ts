import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGoogleToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeGoogleMapsSync(actor: SyncActor, mode: string = 'delta') {
  const { supabase, userId, userEmail, userName } = actor;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('account_type, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  const isOrg = profile?.account_type === 'organization' && profile?.organization_id;
  const orgId = isOrg ? profile.organization_id : null;

  const { data: activeAudit } = await supabase
    .from('reputation_audits')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'analysis', 'generating'])
    .maybeSingle();

  if (activeAudit) {
    return { status: 423, error: 'System Busy: Reputation Audit in progress.', detail: 'Ingestion is paused.' };
  }

  const { data: currentStatus } = await supabase
    .from('sync_status')
    .select('cursor, total_items, last_sync_at')
    .eq('user_id', userId)
    .eq('platform', 'google-maps')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGoogleToken(supabase, userId, 'google-maps');
  } catch (err) {
    return { status: 401, error: 'Google Maps authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Google Maps is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const pageToken = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'google-maps',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://places.googleapis.com/v1/places/saved?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Google Maps saved places' };
  }

  const payload = await response.json();
  const places = payload.places || [];
  const nextPageToken = payload.nextPageToken || null;
  const hasMore = !!nextPageToken;

  const rawEvents = places.map((place: any) => ({
    user_id: userId,
    platform: 'google-maps',
    platform_id: String(place.id),
    event_type: 'location',
    title: place.displayName?.text || 'Saved Place',
    content: `Address: ${place.formattedAddress}`,
    author: userEmail || userName || 'Google User',
    timestamp: new Date().toISOString(), // Maps API doesn't always provide saved time
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: place.id,
      address: place.formattedAddress,
      rating: place.rating,
    },
    is_flagged: false,
    flag_severity: 'none',
    flag_reason: null,
  }));

  if (rawEvents.length > 0) {
    await upsertRawEventsSafely(supabase, rawEvents);
  }

  const now = new Date().toISOString();
  await Promise.all([
    upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google-maps',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextPageToken) : null,
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
        platform: 'google-maps',
        mode: 'backfill',
        cursor: String(nextPageToken),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Google Maps Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
