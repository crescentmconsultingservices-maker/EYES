import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidFigmaToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeFigmaSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'figma')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidFigmaToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Figma authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Figma is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  // Note: Figma's API doesn't have a direct "me/files" pagination without a team/project ID.
  // We'll mock a generic history request here assuming we have project context or using a search endpoint.
  
  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'figma',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  // Example API call assuming we're fetching recent files or project files
  const response = await fetch(`https://api.figma.com/v1/me/files`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Figma files' };
  }

  const payload = await response.json();
  const files = payload.files || [];
  const hasMore = false; // Figma list APIs usually require specific cursors based on projects

  const rawEvents = files.map((file: any) => ({
    user_id: userId,
    platform: 'figma',
    platform_id: String(file.key),
    event_type: 'design',
    title: file.name || 'Figma Design',
    content: `Figma File URL: https://www.figma.com/file/${file.key}`,
    author: userEmail || userName || 'Figma User',
    timestamp: new Date(file.last_modified).toISOString(),
    scope: isOrg ? 'organizational' : 'personal',
    organization_id: orgId,
    metadata: {
      key: file.key,
      thumbnail_url: file.thumbnail_url,
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
      platform: 'figma',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: null,
      error_message: null,
    }),
    supabase.from('user_profiles').update({
      memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
      updated_at: now,
    }).eq('user_id', userId),
  ]);

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
