import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGoogleToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeGoogleSlidesSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'google-slides')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGoogleToken(supabase, userId, 'google-slides');
  } catch (err) {
    return { status: 401, error: 'Google Slides authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Google Slides is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const pageToken = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'google-slides',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const mimeTypeQuery = encodeURIComponent(`mimeType='application/vnd.google-apps.presentation'`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${mimeTypeQuery}&fields=nextPageToken,files(id,name,modifiedTime,webViewLink)${pageToken ? `&pageToken=${pageToken}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Google Slides' };
  }

  const payload = await response.json();
  const files = payload.files || [];
  const nextPageToken = payload.nextPageToken || null;
  const hasMore = !!nextPageToken;

  const rawEvents = files.map((file: any) => ({
    user_id: userId,
    platform: 'google-slides',
    platform_id: String(file.id),
    event_type: 'document',
    title: file.name || 'Untitled Presentation',
    content: `Google Slide URL: ${file.webViewLink}`,
    author: userEmail || userName || 'Google User',
    timestamp: new Date(file.modifiedTime || Date.now()).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: file.id,
      webViewLink: file.webViewLink,
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
      platform: 'google-slides',
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
        platform: 'google-slides',
        mode: 'backfill',
        cursor: String(nextPageToken),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Google Slides Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
