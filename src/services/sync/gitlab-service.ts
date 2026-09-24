import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGitlabToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeGitlabSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'gitlab')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGitlabToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'GitLab authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'GitLab is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const perPage = 100;
  let page = isBackfill ? parseInt(currentStatus?.cursor || '1') : 1;

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'gitlab',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=${perPage}&page=${page}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch GitLab projects' };
  }

  const projects = await response.json() || [];
  const totalPages = parseInt(response.headers.get('x-total-pages') || '1');
  const hasMore = page < totalPages;

  const rawEvents = projects.map((project: any) => ({
    user_id: userId,
    platform: 'gitlab',
    platform_id: String(project.id),
    event_type: 'repository',
    title: project.name_with_namespace,
    content: project.description || `GitLab Project: ${project.web_url}`,
    author: userEmail || userName || 'GitLab User',
    timestamp: new Date(project.last_activity_at || project.updated_at).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: project.id,
      web_url: project.web_url,
      star_count: project.star_count,
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
      platform: 'gitlab',
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
        platform: 'gitlab',
        mode: 'backfill',
        cursor: String(page + 1),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[GitLab Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
