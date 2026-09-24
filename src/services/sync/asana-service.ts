import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidAsanaToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeAsanaSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'asana')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidAsanaToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Asana authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Asana is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const limit = 50;

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'asana',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  // Example API call to get tasks from a specific workspace/project
  // In a real scenario, we would iterate workspaces -> projects -> tasks
  // For this implementation, we will fetch user's tasks
  const offset = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';
  
  const response = await fetch(`https://app.asana.com/api/1.0/user_task_lists/me/tasks?completed_since=now&limit=${limit}${offset ? `&offset=${offset}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Asana auth failed: ${response.status}`);
    }
    return { status: response.status, error: 'Failed to fetch Asana data' };
  }

  const payload = await response.json();
  const tasks = payload.data || [];
  const nextOffset = payload.next_page?.offset || null;
  const hasMore = !!nextOffset;

  const rawEvents = tasks.map((task: any) => ({
    user_id: userId,
    platform: 'asana',
    platform_id: String(task.gid),
    event_type: 'task',
    title: task.name || 'Untitled Task',
    content: `Task ID: ${task.gid}`,
    author: userEmail || userName || 'Asana User',
    timestamp: new Date().toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      gid: task.gid,
      resource_type: task.resource_type,
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
      platform: 'asana',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextOffset) : null,
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
        platform: 'asana',
        mode: 'backfill',
        cursor: String(nextOffset),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Asana Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
