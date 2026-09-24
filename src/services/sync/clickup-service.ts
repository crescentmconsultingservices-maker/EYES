import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidClickUpToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeClickUpSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'clickup')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidClickUpToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'ClickUp authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'ClickUp is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  let page = isBackfill ? parseInt(currentStatus?.cursor || '0') : 0;

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'clickup',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  // Example API call to get user's teams, then tasks. We'll simplify to fetch team tasks for the first team
  // First, get teams
  const teamsResp = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: accessToken }
  });
  
  if (!teamsResp.ok) {
    return { status: teamsResp.status, error: 'Failed to fetch ClickUp teams' };
  }
  const teamsData = await teamsResp.json();
  const teamId = teamsData.teams?.[0]?.id;

  let tasks: any[] = [];
  let hasMore = false;

  if (teamId) {
    const tasksResp = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/task?page=${page}`, {
      headers: { Authorization: accessToken }
    });
    
    if (tasksResp.ok) {
      const tasksData = await tasksResp.json();
      tasks = tasksData.tasks || [];
      hasMore = tasks.length === 100; // ClickUp default pagination limit
    }
  }

  const rawEvents = tasks.map((task: any) => ({
    user_id: userId,
    platform: 'clickup',
    platform_id: String(task.id),
    event_type: 'task',
    title: task.name || 'Untitled Task',
    content: task.description || `Task ID: ${task.id}`,
    author: userEmail || userName || 'ClickUp User',
    timestamp: new Date(parseInt(task.date_created)).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: task.id,
      status: task.status?.status,
      url: task.url,
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
      platform: 'clickup',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(page + 1) : null,
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
        platform: 'clickup',
        mode: 'backfill',
        cursor: String(page + 1),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[ClickUp Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
