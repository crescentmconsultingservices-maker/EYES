import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LEAK_DETECTION_PROMPT } from '@/prompts/leak_scan_prompts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CONFIDENCE_GATE = 0.80;
const LITELLM_URL = process.env.LITELLM_BASE_URL || 'https://eyes-llm-gateway.fly.dev/v1';
const LITELLM_KEY = process.env.LITELLM_KEY || process.env.EYES_GATEWAY_KEY;

export async function POST(req: Request) {
  try {
    // Basic auth check (could be QStash signature validation in prod)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scan_id } = await req.json();
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

      // Build text payload for LLM
      let threadText = '';
      for (const msg of rawTranscript) {
        threadText += `\n[ID: ${msg.message_id} | Date: ${msg.timestamp} | From: ${msg.from} | Dir: ${msg.direction}]\n${msg.content}\n`;
      }

      // 3. Call LiteLLM Gateway
      try {
        const response = await fetch(`${LITELLM_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LITELLM_KEY}`
          },
          body: JSON.stringify({
            model: "claude-haiku", // Using Haiku via gateway as specified in engine
            messages: [
              { role: "system", content: LEAK_DETECTION_PROMPT },
              { role: "user", content: `Analyze this thread:\n\n${threadText}` }
            ],
            temperature: 0.0,
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`LLM Error for thread ${thread.id}:`, errText);
          debugErrors.push({ id: thread.id, type: 'LLM_HTTP_ERROR', details: errText });
          await supabase.from('leak_scan_threads').update({ leak_type: 'INVALID', confidence: 0 }).eq('id', thread.id);
          processedCount++;
          return;
        }

        const llmResult = await response.json();
        const content = llmResult.choices?.[0]?.message?.content;
        
        if (!content) return;

        let parsed;
        try {
          // Use regex to extract the first complete JSON object from the response
          const match = content.match(/\{[\s\S]*\}/);
          if (!match) {
            throw new Error('No JSON object found in response');
          }
          parsed = JSON.parse(match[0]);
        } catch (e) {
          console.error(`Invalid JSON from LLM for thread ${thread.id}`);
          debugErrors.push({ id: thread.id, type: 'JSON_PARSE_ERROR', raw: content });
          await supabase.from('leak_scan_threads').update({ leak_type: 'INVALID', confidence: 0 }).eq('id', thread.id);
          processedCount++;
          return;
        }

        // 4. Verbatim Substring Check & Confidence Gate
        if (parsed.confidence >= CONFIDENCE_GATE && parsed.leak_type && parsed.evidence) {
          const quotedLine = parsed.evidence.quoted_line;
          let verbatimMatch = false;

          // Ensure the quote actually exists verbatim in the transcript
          if (quotedLine) {
            for (const msg of rawTranscript) {
              if (msg.content.includes(quotedLine) || quotedLine.includes(msg.content)) {
                verbatimMatch = true;
                break;
              }
            }
          }

          if (!verbatimMatch) {
            console.warn(`[Leak Scan] Integrity check failed. Quoted line not found verbatim: "${quotedLine}"`);
            parsed.confidence = 0; // Drop below gate automatically
          }
        }

        // 5. Update Database
        if (parsed.confidence >= CONFIDENCE_GATE) {
          await supabase.from('leak_scan_threads').update({
            leak_type: parsed.leak_type,
            confidence: parsed.confidence,
            counterparty_name: parsed.counterparty_name,
            counterparty_domain: parsed.counterparty_domain,
            days_silent: parsed.days_silent,
            evidence: parsed.evidence, // Overwrites raw_transcript with final evidence object
            recovery_angle: parsed.recovery_angle,
            last_activity_date: parsed.evidence.date,
          }).eq('id', thread.id);
          leakCount++;
        } else {
          // Store rejection to avoid reprocessing
          await supabase.from('leak_scan_threads').update({
            leak_type: 'NOT_A_LEAK',
            confidence: parsed.confidence || 0,
            evidence: null
          }).eq('id', thread.id);
        }

        processedCount++;

      } catch (err) {
        console.error(`Error processing thread ${thread.id}:`, err);
        debugErrors.push({ id: thread.id, error: String(err) });
      }
      }));
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedCount, 
      leaks_found: leakCount,
      has_more: threads.length === 50, // Fix: Base has_more on threads fetched, not successfully processed
      debug_errors: debugErrors
    });

  } catch (err: any) {
    console.error('[Leak Scan Detection] Uncaught exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
