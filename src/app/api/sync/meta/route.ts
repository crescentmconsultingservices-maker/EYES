import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch Meta Token from oauth_tokens
    const { data: tokenRow } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .in('platform', ['meta', 'facebook'])
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return NextResponse.json({ error: 'Meta account not connected. Please connect via Connectors.' }, { status: 400 });
    }

    const accessToken = tokenRow.access_token;

    // Update status to syncing
    await supabase.from('sync_status').upsert({
      user_id: user.id,
      platform: 'meta',
      status: 'syncing',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });

    let syncedCount = 0;

    // 2. Sync WhatsApp Business Messages (via Graph API v26.0)
    try {
      const waRes = await fetch(`https://graph.facebook.com/v26.0/me/messages?access_token=${accessToken}`);
      if (waRes.ok) {
        const waData = await waRes.json();
        const waMessages = waData.data || [];

        for (const msg of waMessages) {
          await supabase.from('memories').upsert({
            user_id: user.id,
            platform: 'whatsapp',
            title: `WhatsApp Message from ${msg.from || 'Contact'}`,
            content: msg.message || msg.text?.body || 'Media attachment',
            timestamp: msg.created_time || new Date().toISOString(),
            event_type: 'chat_message',
            author: msg.from || 'WhatsApp Contact',
          }, { onConflict: 'user_id,platform,title,timestamp' });
          syncedCount++;
        }
      }
    } catch (waErr) {
      console.warn('[Meta Sync] WhatsApp sync warning:', waErr);
    }

    // 3. Sync Instagram Direct Messages & Posts
    try {
      const igRes = await fetch(`https://graph.facebook.com/v26.0/me/media?fields=id,caption,timestamp,media_type,comments{text,timestamp,username}&access_token=${accessToken}`);
      if (igRes.ok) {
        const igData = await igRes.json();
        const igPosts = igData.data || [];

        for (const post of igPosts) {
          await supabase.from('memories').upsert({
            user_id: user.id,
            platform: 'instagram',
            title: post.caption ? post.caption.substring(0, 60) : 'Instagram Post',
            content: post.caption || 'Instagram Post Media',
            timestamp: post.timestamp || new Date().toISOString(),
            event_type: 'social_post',
            author: 'Me',
          }, { onConflict: 'user_id,platform,title,timestamp' });
          syncedCount++;
        }
      }
    } catch (igErr) {
      console.warn('[Meta Sync] Instagram sync warning:', igErr);
    }

    // 4. Update sync_status to completed
    await supabase.from('sync_status').upsert({
      user_id: user.id,
      platform: 'meta',
      status: 'idle',
      total_items: syncedCount,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });

    return NextResponse.json({ success: true, synced_count: syncedCount });

  } catch (err: any) {
    console.error('[Meta Sync Fatal Error]:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
