import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidZoomToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeZoomSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'zoom')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidZoomToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Zoom authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Zoom is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const nextPageToken = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'zoom',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://api.zoom.us/v2/users/me/meetings?type=scheduled&page_size=100${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Zoom meetings' };
  }

  const payload = await response.json();
  const meetings = payload.meetings || [];
  const nextToken = payload.next_page_token || null;
  const hasMore = !!nextToken;

  const rawEvents = meetings.map((meeting: any) => ({
    user_id: userId,
    platform: 'zoom',
    platform_id: String(meeting.id),
    event_type: 'meeting',
    title: meeting.topic || 'Zoom Meeting',
    content: `Zoom Meeting URL: ${meeting.join_url}`,
    author: userEmail || userName || 'Zoom User',
    timestamp: new Date(meeting.start_time).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: meeting.id,
      join_url: meeting.join_url,
      duration: meeting.duration,
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
      platform: 'zoom',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextToken) : null,
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
        platform: 'zoom',
        mode: 'backfill',
        cursor: String(nextToken),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Zoom Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
