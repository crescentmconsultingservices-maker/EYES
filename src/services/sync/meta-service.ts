import { SyncResult } from '@/services/sync/provider-registry';
import { type SyncActor } from '@/utils/sync/actor';
import { upsertSyncStatusSafely, upsertRawEventsSafely } from '@/utils/supabase/upsert';

export interface MetaPagingCursors {
  whatsapp_after?: string;
  instagram_after?: string;
}

export async function executeMetaSync(actor: SyncActor, mode: string = 'delta'): Promise<SyncResult> {
  const { supabase, userId, userEmail, userName } = actor;

  try {
    // 1. Data lockdown check
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
        detail: 'Ingestion is paused to ensure data snapshot integrity.',
      };
    }

    // 2. Fetch existing sync status and cursor
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items, metadata')
      .eq('user_id', userId)
      .eq('platform', 'meta')
      .maybeSingle();

    // 3. Fetch Meta Token from oauth_tokens
    const { data: tokenRow } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .in('platform', ['meta', 'facebook'])
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return {
        status: 401,
        error: 'Meta account not connected. Please connect via Connectors.',
      };
    }

    const accessToken = tokenRow.access_token;
    const isBackfill = mode === 'backfill';

    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'meta',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    let currentCursors: MetaPagingCursors = {};
    if (currentStatus?.metadata?.meta_cursors) {
      currentCursors = currentStatus.metadata.meta_cursors;
    }

    const rawEvents: any[] = [];
    let hasMoreWA = false;
    let nextWaAfter: string | undefined = undefined;
    let hasMoreIG = false;
    let nextIgAfter: string | undefined = undefined;

    // 4. Fetch WhatsApp messages
    try {
      const waUrl = new URL('https://graph.facebook.com/v26.0/me/messages');
      waUrl.searchParams.set('access_token', accessToken);
      waUrl.searchParams.set('limit', '50');
      if (isBackfill && currentCursors.whatsapp_after) {
        waUrl.searchParams.set('after', currentCursors.whatsapp_after);
      }

      const waRes = await fetch(waUrl.toString(), { cache: 'no-store' });
      if (waRes.ok) {
        const waData = await waRes.json();
        const waMessages = waData.data || [];

        for (const msg of waMessages) {
          rawEvents.push({
            user_id: userId,
            platform: 'whatsapp',
            platform_id: msg.id || `wa_${msg.created_time || Date.now()}`,
            event_type: 'chat_message',
            title: `WhatsApp Message from ${msg.from || 'Contact'}`,
            content: msg.message || msg.text?.body || 'Media attachment',
            author: msg.from || 'WhatsApp Contact',
            timestamp: msg.created_time || new Date().toISOString(),
            metadata: {
              raw_id: msg.id,
              from: msg.from,
              type: msg.type || 'text',
            },
          });
        }

        if (waData.paging?.cursors?.after && waMessages.length >= 50) {
          hasMoreWA = true;
          nextWaAfter = waData.paging.cursors.after;
        }
      }
    } catch (waErr) {
      console.warn('[Meta Sync] WhatsApp sync warning:', waErr);
    }

    // 5. Fetch Instagram media / posts
    try {
      const igUrl = new URL('https://graph.facebook.com/v26.0/me/media');
      igUrl.searchParams.set('access_token', accessToken);
      igUrl.searchParams.set('fields', 'id,caption,timestamp,media_type,comments{text,timestamp,username}');
      igUrl.searchParams.set('limit', '50');
      if (isBackfill && currentCursors.instagram_after) {
        igUrl.searchParams.set('after', currentCursors.instagram_after);
      }

      const igRes = await fetch(igUrl.toString(), { cache: 'no-store' });
      if (igRes.ok) {
        const igData = await igRes.json();
        const igPosts = igData.data || [];

        for (const post of igPosts) {
          rawEvents.push({
            user_id: userId,
            platform: 'instagram',
            platform_id: post.id || `ig_${post.timestamp || Date.now()}`,
            event_type: 'social_post',
            title: post.caption ? post.caption.substring(0, 60) : 'Instagram Post',
            content: post.caption || 'Instagram Post Media',
            author: userName || userEmail || 'Me',
            timestamp: post.timestamp || new Date().toISOString(),
            metadata: {
              media_type: post.media_type,
              id: post.id,
              comments_count: post.comments?.data?.length || 0,
            },
          });
        }

        if (igData.paging?.cursors?.after && igPosts.length >= 50) {
          hasMoreIG = true;
          nextIgAfter = igData.paging.cursors.after;
        }
      }
    } catch (igErr) {
      console.warn('[Meta Sync] Instagram sync warning:', igErr);
    }

    // 5.5 Fetch Facebook Profile and Feed
    try {
      const fbMeUrl = new URL('https://graph.facebook.com/v19.0/me');
      fbMeUrl.searchParams.set('access_token', accessToken);
      fbMeUrl.searchParams.set('fields', 'id,name,picture,link');

      const fbMeRes = await fetch(fbMeUrl.toString(), { cache: 'no-store' });
      if (fbMeRes.ok) {
        const fbMeData = await fbMeRes.json();
        if (fbMeData?.id) {
          rawEvents.push({
            user_id: userId,
            platform: 'facebook',
            platform_id: `fb_profile_${fbMeData.id}`,
            event_type: 'social_profile',
            title: `Facebook Profile: ${fbMeData.name || 'Account'}`,
            content: `Connected Meta Facebook account for ${fbMeData.name || 'User'} (Facebook ID: ${fbMeData.id})`,
            author: fbMeData.name || userName || 'Facebook User',
            timestamp: new Date().toISOString(),
            metadata: {
              facebook_id: fbMeData.id,
              name: fbMeData.name,
              picture: fbMeData.picture?.data?.url,
            },
          });
        }
      }

      const fbFeedUrl = new URL('https://graph.facebook.com/v19.0/me/posts');
      fbFeedUrl.searchParams.set('access_token', accessToken);
      fbFeedUrl.searchParams.set('fields', 'id,message,story,created_time');
      fbFeedUrl.searchParams.set('limit', '25');

      const fbFeedRes = await fetch(fbFeedUrl.toString(), { cache: 'no-store' });
      if (fbFeedRes.ok) {
        const fbFeedData = await fbFeedRes.json();
        const fbPosts = fbFeedData.data || [];
        for (const post of fbPosts) {
          rawEvents.push({
            user_id: userId,
            platform: 'facebook',
            platform_id: post.id,
            event_type: 'social_post',
            title: post.story || (post.message ? post.message.substring(0, 60) : 'Facebook Post'),
            content: post.message || post.story || 'Facebook update',
            author: userName || 'Facebook User',
            timestamp: post.created_time || new Date().toISOString(),
            metadata: {
              id: post.id,
              raw_story: post.story,
            },
          });
        }
      }
    } catch (fbErr) {
      console.warn('[Meta Sync] Facebook profile/feed sync note:', fbErr);
    }

    // 6. Save raw events & memories
    if (rawEvents.length > 0) {
      await upsertRawEventsSafely(supabase, rawEvents);

      // Also upsert to memories for immediate cognitive access
      for (const ev of rawEvents) {
        try {
          await supabase.from('memories').upsert({
            user_id: ev.user_id,
            platform: ev.platform,
            title: ev.title,
            content: ev.content,
            timestamp: ev.timestamp,
            event_type: ev.event_type,
            author: ev.author,
          }, { onConflict: 'user_id,platform,title,timestamp' });
        } catch {
          // ignore duplicate memories
        }
      }
    }

    const hasMore = hasMoreWA || hasMoreIG;
    const updatedCursors: MetaPagingCursors = {
      whatsapp_after: nextWaAfter || currentCursors.whatsapp_after,
      instagram_after: nextIgAfter || currentCursors.instagram_after,
    };

    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'meta',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 60 : 100,
        total_items: (currentStatus?.total_items || 0) + rawEvents.length,
        last_sync_at: now,
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: hasMore ? (nextWaAfter || nextIgAfter || null) : null,
        metadata: { meta_cursors: updatedCursors },
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
        updated_at: now,
      }).eq('user_id', userId),
    ]);

    // 7. Auto-chain remaining backfill via QStash
    if (hasMore && isBackfill) {
      try {
        const { dispatchNextSyncJob } = await import('@/services/sync/queue-dispatcher');
        await dispatchNextSyncJob({
          userId,
          platform: 'meta',
          mode: 'backfill',
          cursor: nextWaAfter || nextIgAfter,
          delaySeconds: 3,
        });
      } catch (qErr) {
        console.warn('[Meta Sync] Could not schedule next QStash sync chunk:', qErr);
      }
    }

    return {
      status: 200,
      data: {
        success: true,
        count: rawEvents.length,
        hasMore,
      },
    };
  } catch (err: any) {
    console.error('[Meta Sync Fatal Error]:', err);
    try {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'meta',
        status: 'error',
        error_message: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    } catch { /* ignore */ }
    return { status: 500, error: err.message || 'Sync failed' };
  }
}
