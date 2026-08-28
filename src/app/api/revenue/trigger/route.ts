import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidGoogleToken } from '@/services/auth/oauth';

export async function POST(req: Request) {
  try {
    const SCAN_WINDOW_DAYS = 182;
    const BATCH_PAGE_SIZE = 100;
    const MAX_MAILBOX_THREADS = 20000;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_id, client_stated_fee, mock } = await req.json();
    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // 1. Create the scan namespace
    const { data: scanData, error: scanError } = await supabase
      .from('leak_scans')
      .insert({
        user_id,
        client_stated_fee: client_stated_fee || 7000,
        status: 'processing'
      })
      .select('scan_id')
      .single();

    if (scanError || !scanData) {
      return NextResponse.json({ error: 'Failed to create scan namespace' }, { status: 500 });
    }
    const scanId = scanData.scan_id;

    // 2. Fetch Google Token
    if (mock) {
      // MOCK MODE: Inject fake threads directly
      await supabase.from('leak_scan_threads').insert([
        {
          scan_id: scanId,
          thread_id: 'mock_thread_1',
          evidence: {
            _raw_transcript: [
              { from: 'client@acme.com', content: 'We love the proposal! When can you start?', direction: 'inbound', timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), message_id: 'm1' },
              { from: 'you@yourdomain.com', content: 'Great to hear! I will send over the final contract by Friday so we can kick off.', direction: 'outbound', timestamp: new Date(Date.now() - 14 * 86400000).toISOString(), message_id: 'm2' }
            ]
          }
        },
        {
          scan_id: scanId,
          thread_id: 'mock_thread_2',
          evidence: {
            _raw_transcript: [
              { from: 'lead@startup.io', content: 'Hey there, we are looking to hire a senior engineer. Are you taking on new clients?', direction: 'inbound', timestamp: new Date(Date.now() - 20 * 86400000).toISOString(), message_id: 'm3' }
            ]
          }
        }
      ]);
      return NextResponse.json({ success: true, manifest: { scan_id: scanId, threads_found: 2, threads_eligible: 2, skipped_bulk: 0, skipped_empty: 0 } });
    }

    const accessToken = await getValidGoogleToken(supabase, user_id, 'gmail');
    if (!accessToken) {
      await supabase.from('leak_scans').update({ status: 'failed' }).eq('scan_id', scanId);
      return NextResponse.json({ error: 'Gmail token invalid or missing' }, { status: 401 });
    }

    // 3. Get user's email address to determine directionality
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const profileData = await profileRes.json();
    const userEmail = profileData.emailAddress?.toLowerCase();

    // 4. Page through threads
    let nextPageToken: string | undefined = undefined;
    let totalThreadsFound = 0;
    const threadIds: string[] = [];

    while (true) {
      const fetchUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
      fetchUrl.searchParams.set('maxResults', String(BATCH_PAGE_SIZE));
      fetchUrl.searchParams.set('q', `newer_than:${SCAN_WINDOW_DAYS}d`);
      if (nextPageToken) fetchUrl.searchParams.set('pageToken', nextPageToken);

      const listResponse = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!listResponse.ok) break;

      const listBody = await listResponse.json();
      const pageThreads = listBody.threads || [];
      totalThreadsFound += pageThreads.length;

      pageThreads.forEach((t: any) => threadIds.push(t.id));

      if (totalThreadsFound > MAX_MAILBOX_THREADS) {
        await supabase.from('leak_scans').update({ status: 'failed' }).eq('scan_id', scanId);
        return NextResponse.json({
          scan_manifest: {
            threads_found: totalThreadsFound,
            threads_eligible: 0,
            skipped_bulk: 0,
            skipped_empty: 0,
            aborted_reason: 'MAX_MAILBOX_THREADS exceeded'
          }
        }, { status: 400 });
      }

      nextPageToken = listBody.nextPageToken;
      if (!nextPageToken) break;
    }

    // 5. Publish chunks to QStash for background ingestion
    const { Client } = await import('@upstash/qstash');
    const qstashToken = process.env.QSTASH_TOKEN || 'dummy_token'; 
    const qstash = new Client({ token: qstashToken });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const workerUrl = `${baseUrl}/api/revenue/ingest-worker`;

    const chunkSize = 20;
    const publishPromises = [];
    
    for (let i = 0; i < threadIds.length; i += chunkSize) {
      const chunk = threadIds.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= threadIds.length;
      
      publishPromises.push(
        qstash.publishJSON({
          url: workerUrl,
          body: {
            scanId,
            userId: user_id,
            threadIds: chunk,
            isLastChunk
          }
        })
      );
    }
    
    await Promise.allSettled(publishPromises);

    const manifest = {
      scan_id: scanId,
      threads_found: totalThreadsFound,
      threads_eligible: -1, // Computed asynchronously by workers
      skipped_bulk: -1,
      skipped_empty: -1,
      status: 'queued'
    };

    console.log('[Leak Scan] Ingest Queued via QStash:', manifest);

    return NextResponse.json({ success: true, manifest });

  } catch (err: any) {
    console.error('[Leak Scan Ingest] Uncaught exception:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
