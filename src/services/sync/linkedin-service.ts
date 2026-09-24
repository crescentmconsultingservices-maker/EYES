import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidLinkedInToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeLinkedInSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'linkedin')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidLinkedInToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'LinkedIn authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'LinkedIn is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const cursor = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '0';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'linkedin',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://api.linkedin.com/v2/posts?q=author&author=urn:li:person:me&count=50&start=${cursor}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch LinkedIn posts' };
  }

  const payload = await response.json();
  const posts = payload.elements || [];
  const nextStart = parseInt(cursor) + posts.length;
  const hasMore = posts.length === 50;

  const rawEvents = posts.map((post: any) => ({
    user_id: userId,
    platform: 'linkedin',
    platform_id: String(post.id),
    event_type: 'post',
    title: 'LinkedIn Post',
    content: post.commentary || `LinkedIn Post ID: ${post.id}`,
    author: userEmail || userName || 'LinkedIn User',
    timestamp: new Date(post.createdAt).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: post.id,
      visibility: post.visibility,
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
      platform: 'linkedin',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(nextStart) : null,
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
        platform: 'linkedin',
        mode: 'backfill',
        cursor: String(nextStart),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[LinkedIn Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
