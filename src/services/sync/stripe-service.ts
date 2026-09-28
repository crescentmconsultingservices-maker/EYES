import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidStripeToken } from '@/services/auth/oauth';
import { type SyncActor } from '@/utils/sync/actor';

export async function executeStripeSync(actor: SyncActor, mode: string = 'delta') {
  const { supabase, userId, userEmail, userName } = actor;

  const { data: currentStatus } = await supabase
    .from('sync_status')
    .select('cursor, total_items, last_sync_at')
    .eq('user_id', userId)
    .eq('platform', 'stripe')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidStripeToken(supabase, userId);
  } catch (err) {
    return { status: 401, error: 'Stripe authentication failed.', detail: String(err) };
  }

  if (!accessToken) {
    return { status: 401, error: 'Stripe is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const startingAfter = isBackfill && currentStatus?.cursor ? currentStatus.cursor : '';

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'stripe',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  // Fetching recent charges
  const response = await fetch(`https://api.stripe.com/v1/charges?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { status: response.status, error: 'Failed to fetch Stripe charges' };
  }

  const payload = await response.json();
  const charges = payload.data || [];
  const hasMore = payload.has_more;
  const nextCursor = hasMore && charges.length > 0 ? charges[charges.length - 1].id : null;

  const rawEvents = charges.map((charge: any) => {
    return {
      user_id: userId,
      platform: 'stripe',
      platform_id: String(charge.id),
      event_type: 'payment',
      title: `Stripe Charge: ${charge.amount / 100} ${charge.currency.toUpperCase()}`,
      content: `Received payment of ${charge.amount / 100} ${charge.currency.toUpperCase()}.\nStatus: ${charge.status}\nReceipt Email: ${charge.receipt_email || 'N/A'}\nDescription: ${charge.description || 'N/A'}`,
      author: charge.receipt_email || userEmail || userName || 'Stripe Customer',
      timestamp: new Date(charge.created * 1000).toISOString(),
      scope: 'personal',
      organization_id: null,
      metadata: {
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        payment_method: charge.payment_method_details?.type,
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
      platform: 'stripe',
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
        platform: 'stripe',
        mode: 'backfill',
        cursor: String(nextCursor),
        delaySeconds: 3,
      });
    } catch (qErr) {
      console.warn('[Stripe Sync] Could not schedule next QStash sync chunk:', qErr);
    }
  }

  return {
    status: 200,
    data: { ok: true, syncedItems: rawEvents.length, hasMore }
  };
}
