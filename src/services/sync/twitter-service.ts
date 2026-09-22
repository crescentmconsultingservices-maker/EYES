import { SyncResult } from '@/services/sync/provider-registry';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidTwitterToken } from '@/services/auth/oauth';
import { scoreTwitterEvent } from '@/utils/risk/scorer';
import { type SyncActor } from '@/utils/sync/actor';

type TwitterMe = { data: { id: string; name: string; username: string } };

type TwitterTweet = {
  id: string;
  text: string;
  created_at?: string;
};

type TwitterTweetsPage = {
  data?: TwitterTweet[];
  meta?: {
    next_token?: string;
    result_count?: number;
  };
};

export async function executeTwitterSync(actor: SyncActor, mode: string = 'delta'): Promise<SyncResult> {
  try {
    const { supabase, userId } = actor;

    // --- DATA LOCKDOWN GUARD ---
    const { data: activeAudit } = await supabase
      .from('reputation_audits')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'analysis', 'generating'])
      .maybeSingle();

    if (activeAudit) {
      return { 
        status: 423, 
        error: 'System Busy: Reputation Audit in progress.', 
        detail: 'Ingestion is paused to ensure data snapshot integrity for your current audit.' 
      };
    }

    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'twitter')
      .maybeSingle();

    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'twitter',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    const accessToken = await getValidTwitterToken(supabase, userId);
    if (!accessToken) {
      return { status: 401, error: 'Twitter session expired and refresh failed.' };
    }

    const meResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'the-eyes/1.0',
      },
      cache: 'no-store',
    });

    if (!meResponse.ok) {
      return { status: 502, error: `Twitter profile request failed (${meResponse.status})` };
    }

    const me = (await meResponse.json()) as TwitterMe;
    const twitterUserId = me.data.id;

    const isBackfill = mode === 'backfill';
    const maxPages = isBackfill ? 10 : 2; // e.g. 1000 items on backfill, 200 on delta
    
    let allTweets: TwitterTweet[] = [];
    let paginationToken: string | undefined = currentStatus?.cursor || undefined;
    let hasMore = true;
    let pagesFetched = 0;

    // --- PAGINATION LOOP ---
    while (pagesFetched < maxPages && hasMore) {
      const fetchUrl = new URL(`https://api.twitter.com/2/users/${twitterUserId}/tweets`);
      fetchUrl.searchParams.set('max_results', '100');
      fetchUrl.searchParams.set('tweet.fields', 'created_at');
      if (paginationToken) {
        fetchUrl.searchParams.set('pagination_token', paginationToken);
      }

      const tweetsResponse = await fetch(fetchUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'the-eyes/1.0',
        },
        cache: 'no-store',
      });

      if (!tweetsResponse.ok) {
        if (tweetsResponse.status === 429) {
          console.warn('[Twitter Sync] Rate limited');
          hasMore = true; // Still have more, but we need to wait
        } else {
          hasMore = false;
        }
        break;
      }

      const body = (await tweetsResponse.json()) as TwitterTweetsPage;
      const tweets = body.data ?? [];
      allTweets = [...allTweets, ...tweets];
      
      paginationToken = body.meta?.next_token || undefined;
      hasMore = Boolean(paginationToken && tweets.length > 0);
      pagesFetched++;
      
      if (!hasMore || !isBackfill) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limit buffer
    }

    const events = await Promise.all(allTweets.map(async (tweet) => {
      const content = tweet.text || '';
      const risk = await scoreTwitterEvent({
        text: content,
      });

      return {
        user_id: userId,
        platform: 'twitter',
        platform_id: tweet.id,
        event_type: 'tweet',
        title: `Tweet by @${me.data.username}`,
        content,
        author: me.data.username,
        timestamp: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
        metadata: {
          risk_score: risk.score,
          risk_factors: risk.reasons,
        },
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons[0] || null,
      };
    }));

    if (events.length > 0) {
      await upsertRawEventsSafely(supabase, events);
    }

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const [, profileUpdate] = await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'twitter',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        cursor: hasMore ? paginationToken : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? events.length,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    if (profileUpdate.error) {
      throw profileUpdate.error;
    }

    // Auto-chain remaining backfill via QStash
    if (hasMore && mode === 'backfill' && paginationToken) {
      try {
        const { dispatchNextSyncJob } = await import('@/services/sync/queue-dispatcher');
        await dispatchNextSyncJob({
          userId,
          platform: 'twitter',
          mode: 'backfill',
          cursor: paginationToken,
          delaySeconds: 15,
        });
      } catch (qErr) {
        console.warn('[Twitter Sync] Could not schedule next QStash sync chunk:', qErr);
      }
    }

    return { status: 200, data: {  
      ok: true, 
      syncedTweets: events.length,
      hasMore 
     } };
  } catch (error) {
    console.error('twitter sync error:', error);
    try {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'twitter',
        status: 'error',
        error_message: error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    } catch (dbErr) {
      console.error('failed to update sync status on twitter sync error:', dbErr);
    }
    return { status: 500, error: 'Unable to sync Twitter data right now.' };
  }
}
