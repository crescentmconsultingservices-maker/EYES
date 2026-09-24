import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidCursorToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeCursorSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'cursor')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidCursorToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Cursor authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Cursor is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const cursor = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'cursor',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  const response = await fetch(`https://api.cursor.so/v1/sessions${cursor ? `?cursor=${cursor}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Cursor sessions' };
  }

  const payload = await response.json();
  const sessions = payload.data || [];
  const nextCursor = payload.meta?.next_cursor || null;
  const hasMore = !!nextCursor;

  const rawEvents = sessions.map((session: any) => ({
    user_id: userId,
    platform: 'cursor',
    platform_id: String(session.id),
    event_type: 'code_session',
    title: session.title || 'Cursor AI Session',
    content: `Workspace: ${session.workspace}, Duration: ${session.duration_seconds}s`,
    author: userEmail || userName || 'Cursor User',
    timestamp: new Date(session.created_at).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      id: session.id,
      workspace: session.workspace,
      prompt_count: session.prompt_count,
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
      platform: 'cursor',
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
        platform: 'cursor',
        mode: 'backfill',
        cursor: String(nextCursor),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Cursor Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
