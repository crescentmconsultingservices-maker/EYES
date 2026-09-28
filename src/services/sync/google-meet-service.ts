import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGoogleToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeGoogleMeetSync(actor: SyncActor, mode: string = 'delta') {
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
    .eq('platform', 'google-meet')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGoogleToken(supabase, userId, 'google-meet');
  } catch (err) {
    return { status: 401, error: 'Google Meet authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Google Meet is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const pageToken = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'google-meet',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  // Consumer Google Meet Sync via Google Calendar API
  // We extract Google Meet sessions by identifying calendar events with conference data.
  // We filter out declined meetings and extract participant metadata to enrich the backend graph.
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?q=meet.google.com${pageToken ? `&pageToken=${pageToken}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Google Meet data via Calendar' };
  }

  const payload = await response.json();
  const events = payload.items || [];
  const nextPageToken = payload.nextPageToken || null;
  const hasMore = !!nextPageToken;

  const validEvents = events.filter((event: any) => {
    if (!event.attendees) return true; // If no attendees listed, assume user is owner/going
    const me = event.attendees.find((a: any) => a.self || a.email === userEmail);
    // If explicitly declined, skip it.
    if (me && me.responseStatus === 'declined') return false;
    return true;
  });

  const rawEvents = validEvents.map((event: any) => {
    const attendees = (event.attendees || []).map((a: any) => a.email || a.displayName).filter(Boolean);
    const coParticipants = attendees.filter((a: string) => a !== userEmail).join(', ');
    
    return {
      user_id: userId,
      platform: 'google-meet',
      platform_id: String(event.id),
      event_type: 'scheduled_meeting',
      title: `[Scheduled] ${event.summary || 'Untitled Meeting'}`,
      content: `Google Meet link: ${event.hangoutLink}\nScheduled Participants: ${coParticipants || 'None'}\nNote: This is a calendar schedule, actual attendance is not confirmed.`,
      author: event.creator?.email || userEmail || userName || 'Google User',
      timestamp: new Date(event.start?.dateTime || event.start?.date || event.updated).toISOString(),
      scope: isOrg ? 'organizational' : 'personal',
      organization_id: orgId,
      metadata: {
        id: event.id,
        hangoutLink: event.hangoutLink,
        attendee_count: attendees.length,
        attendees: attendees,
        status: event.status,
      },
      is_flagged: false,
      flag_severity: 'none',
      flag_reason: null,
    };
  });

  if (rawEvents.length > 0) {
    await upsertRawEventsSafely(supabase, rawEvents);
  }

  const now = new Date().toISOString();
  await Promise.all([
    upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google-meet',
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
        platform: 'google-meet',
        mode: 'backfill',
        cursor: String(nextPageToken),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Google Meet Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
