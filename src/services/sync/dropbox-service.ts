import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidDropboxToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeDropboxSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'dropbox')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidDropboxToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Dropbox authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Dropbox is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const cursor = isBackfill && currentStatus?.cursor ? currentStatus.cursor : null;

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'dropbox',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const url = cursor 
    ? 'https://api.dropboxapi.com/2/files/list_folder/continue'
    : 'https://api.dropboxapi.com/2/files/list_folder';
    
  const body = cursor 
    ? { cursor }
    : { path: '', recursive: true, limit: 100 };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Dropbox files' };
  }

  const payload = await response.json();
  const entries = payload.entries || [];
  const nextCursor = payload.cursor || null;
  const hasMore = payload.has_more || false;

  const rawEvents = entries.filter((e: any) => e['.tag'] === 'file').map((file: any) => ({
    user_id: userId,
    platform: 'dropbox',
    platform_id: String(file.id),
    event_type: 'document',
    title: file.name || 'Dropbox File',
    content: `Path: ${file.path_display}`,
    author: userEmail || userName || 'Dropbox User',
    timestamp: new Date(file.client_modified || Date.now()).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: file.id,
      path: file.path_display,
      size: file.size,
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
      platform: 'dropbox',
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
        platform: 'dropbox',
        mode: 'backfill',
        cursor: String(nextCursor),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Dropbox Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
