import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidSentryToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeSentrySync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'sentry')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidSentryToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Sentry authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Sentry is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const cursor = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'sentry',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://sentry.io/api/0/projects/${cursor ? `?cursor=${cursor}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Sentry projects' };
  }

  const projects = await response.json() || [];
  
  // Sentry uses Link headers for pagination, simple boolean check for example:
  const linkHeader = response.headers.get('link') || '';
  const hasMore = linkHeader.includes('rel="next"') && linkHeader.includes('results="true"');
  let nextCursor = null;
  if (hasMore) {
    const match = linkHeader.match(/cursor="([^"]+)"/);
    if (match) nextCursor = match[1];
  }

  const rawEvents = projects.map((project: any) => ({
    user_id: userId,
    platform: 'sentry',
    platform_id: String(project.id),
    event_type: 'error_log',
    title: project.name || 'Sentry Project',
    content: `Project slug: ${project.slug}, platform: ${project.platform}`,
    author: userEmail || userName || 'Sentry User',
    timestamp: new Date(project.dateCreated).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: project.id,
      slug: project.slug,
      platform: project.platform,
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
      platform: 'sentry',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore && nextCursor ? String(nextCursor) : null,
      error_message: null,
    }),
    supabase.from('user_profiles').update({
      memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
      updated_at: now,
    }).eq('user_id', userId),
  ]);

  if (hasMore && nextCursor && isBackfill) {
    try {
      const { dispatchNextSyncJob } = await import('@/services/sync/queue-dispatcher');
      await dispatchNextSyncJob({
        userId,
        platform: 'sentry',
        mode: 'backfill',
        cursor: String(nextCursor),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Sentry Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
