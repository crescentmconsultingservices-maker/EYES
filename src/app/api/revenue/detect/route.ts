import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { classifyThread } from '@/core/engine/classifier';

const CONFIDENCE_GATE = 0.80;
const LITELLM_URL = process.env.LITELLM_BASE_URL || 'https://eyes-llm-gateway.fly.dev/v1';
const LITELLM_KEY = process.env.LITELLM_KEY || process.env.EYES_GATEWAY_KEY || '';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Basic auth check (could be QStash signature validation in prod)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scan_id, mode } = await req.json();
    if (!scan_id) {
      return NextResponse.json({ error: 'Missing scan_id' }, { status: 400 });
    }

    // 1. Fetch threads that haven't been processed yet
    const { data: threads, error: fetchErr } = await supabase
      .from('leak_scan_threads')
      .select('id, evidence')
      .eq('scan_id', scan_id)
      .is('leak_type', null)
      .limit(50); // Process in batches

    if (fetchErr || !threads) {
      return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 });
    }

    if (threads.length === 0) {
      // Mark scan as complete if no more threads
      await supabase.from('leak_scans').update({ status: 'complete' }).eq('scan_id', scan_id);
      return NextResponse.json({ success: true, message: 'All threads processed' });
    }

    let processedCount = 0;
    let leakCount = 0;
    const debugErrors: any[] = [];

    // 2. Process threads in parallel chunks to speed up from 15 mins to <2 mins
    const CHUNK_SIZE = 10;
    for (let i = 0; i < threads.length; i += CHUNK_SIZE) {
      const chunk = threads.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (thread) => {
      // The transcript array was temporarily stored in evidence._raw_transcript in Phase 2
      const rawTranscript = (thread.evidence as any)?._raw_transcript;
      if (!rawTranscript || !Array.isArray(rawTranscript)) {
        await supabase.from('leak_scan_threads').update({ confidence: 0, leak_type: 'INVALID' }).eq('id', thread.id);
        return;
      }

      // 3. Call Core Classifier Engine
      const parsed = await classifyThread(rawTranscript, LITELLM_URL, LITELLM_KEY);

      if (parsed.error) {
        console.error(`Error processing thread ${thread.id}:`, parsed.error);
        debugErrors.push({ id: thread.id, error: parsed.error });
        await supabase.from('leak_scan_threads').update({ leak_type: 'INVALID', confidence: 0 }).eq('id', thread.id);
        processedCount++;
        return;
      }

      // 4. Update Database
      if (parsed.confidence >= CONFIDENCE_GATE) {
        await supabase.from('leak_scan_threads').update({
          leak_type: parsed.leak_type,
          confidence: parsed.confidence,
          counterparty_name: parsed.counterparty_name,
          counterparty_domain: parsed.counterparty_domain,
          days_silent: parsed.days_silent,
          evidence: parsed.evidence,
          recovery_angle: parsed.recovery_angle,
          last_activity_date: parsed.evidence?.date,
          value_tier: parsed.value_tier,
          quantity: parsed.quantity,
          unit_price: parsed.unit_price,
          unit_hint: parsed.unit_hint,
          est_value_eur: parsed.stated_value_eur || (parsed.quantity && parsed.unit_price ? parsed.quantity * parsed.unit_price : null),
        }).eq('id', thread.id);
        leakCount++;
      } else {
        await supabase.from('leak_scan_threads').update({
          leak_type: 'NOT_A_LEAK',
          confidence: parsed.confidence || 0,
          evidence: null
        }).eq('id', thread.id);
      }

      processedCount++;
      }));
    }

    const hasMore = threads.length === 50;

    if (hasMore) {
      if (mode !== 'poll') {
        // Enqueue next batch via QStash
        const { Client } = await import('@upstash/qstash');
        const qstashToken = process.env.QSTASH_TOKEN || 'dummy_token'; 
        const qstash = new Client({ token: qstashToken });
        
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        await qstash.publishJSON({
          url: `${baseUrl}/api/revenue/detect`,
          body: { scan_id },
          headers: {
            'Authorization': `Bearer ${process.env.CRON_SECRET}`
          }
        });
      }
    } else {
        // Mark scan as complete
        await supabase.from('leak_scans').update({ status: 'complete' }).eq('scan_id', scan_id);
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedCount, 
      leaks_found: leakCount,
      has_more: hasMore,
      debug_errors: debugErrors
    });

  } catch (err: any) {
    console.error('[Leak Scan Detection] Uncaught exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
