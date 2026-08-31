import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

const GREETINGS = new Set(['hi', 'hello', 'hey', 'hi there', 'hello there', 'hey there', 'good morning', 'good evening', 'good afternoon', 'help', 'who are you', 'what are you']);

function isGreeting(q: string): boolean {
  const clean = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return GREETINGS.has(clean) || clean === 'hi' || clean === 'hello' || clean === 'hey';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 0. Instant Fast-Path for Simple Greetings (~30ms)
    if (isGreeting(query)) {
      return NextResponse.json({
        understanding: {
          answer: "Hey there! How's it going? How can I help you today?",
          confidence: 1.0,
          temporal_validity: {
            believed_since: new Date().toISOString(),
            is_current: true
          },
          receipts: [],
          intent: 'none',
          intent_data: []
        }
      }, { status: 200 });
    }

    // 1. Get embedding for natural language query with quick timeout safeguard
    let embedding: number[] | null = null;
    try {
      const embedPromise = invokeModel({
        capability: 'embed',
        messages: [{ role: 'user', content: query }],
        capture: false,
      });

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1800));
      const embedResult = await Promise.race([embedPromise, timeoutPromise]) as any;

      if (embedResult && typeof embedResult === 'object' && 'embedding' in embedResult) {
        embedding = embedResult.embedding as number[];
      }
    } catch (e) {
      console.warn('[IRIS API] Embedding fallback activated:', e);
    }

    // 2. Perform hybrid search to retrieve context and receipts
    let evidenceText = '';
    const allReceipts: Array<{ id: number; source_url: string; span: string }> = [];
    
    if (embedding) {
      const { data } = await supabase.rpc('hybrid_search', {
        query_text: query,
        query_embedding: embedding,
        match_count: 5,
        user_id_arg: user.id,
      });

      if (data && data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((r: any, index: number) => {
          if (r.similarity > 0.18) {
            const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : 'unknown date';
            const snippet = (r.content || '').slice(0, 300);
            evidenceText += `[Evidence ID: ${index}] [${r.platform.toUpperCase()}] [${date}]\n${snippet}\n\n`;
            
            if (r.source_url) {
              allReceipts.push({
                id: index,
                source_url: r.source_url,
                span: snippet
              });
            }
          }
        });
      }
    }

    // 3. Ask the AI to formulate the exact answer and calculate confidence
    const systemPrompt = `You are the IRIS Understanding API. Answer the user's question based strictly on the evidence below. 
If there is no evidence, say "I don't have enough context."
If the user is just saying a casual greeting (like "hi", "hello"), respond conversationally and DO NOT use any evidence.

Intent Classification:
- If the user is asking about commitments they made, set "intent" to "commitment".
- If the user is asking about things they are avoiding or slipping on, set "intent" to "slippage".
- If the user is asking about how their beliefs/opinions on a topic changed recently, set "intent" to "change".
- Otherwise, set "intent" to "none".

Respond in strict JSON format:
{
  "answer": "your answer here",
  "confidence": 0.0 to 1.0,
  "used_evidence_ids": [],
  "intent": "commitment" | "slippage" | "change" | "none"
}

EVIDENCE:
${evidenceText || 'No records found.'}`;

    const rawResponse = await invokeModel({
      capability: 'chat',
      messages: [{ role: 'user', content: query }],
      system: systemPrompt,
      preference: 'auto'
    });

    let answer = "No response generated.";
    let confidence = 0.0;
    let finalReceipts: any[] = [];
    let intent = "none";

    try {
      if (typeof rawResponse === 'string') {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          answer = parsed.answer || answer;
          confidence = parsed.confidence || 0.0;
          intent = parsed.intent || "none";
          
          const usedIds = Array.isArray(parsed.used_evidence_ids) ? parsed.used_evidence_ids : [];
          finalReceipts = allReceipts
            .filter(r => usedIds.includes(r.id))
            .map(r => ({ source_url: r.source_url, span: r.span }));
        }
      }
    } catch (e) {
      answer = typeof rawResponse === 'string' ? rawResponse : answer;
    }

    // 4. Fetch intent specific graph data if an intent was detected
    let intentData: any[] = [];
    
    // Check if the user is operating within an organization context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_type, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOrgMode = profile?.account_type === 'organization' && profile?.organization_id;

    if (intent && intent !== 'none') {
      let baseQuery = supabase
        .from('chronic_edges')
        .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)');

      // Standard user profiles are restricted to their own entries at the application layer.
      // Organization accounts rely on RLS policies to query company-wide scoped nodes and edges safely.
      if (!isOrgMode) {
        baseQuery = baseQuery.eq('user_id', user.id);
      }

      if (intent === 'commitment') {
        const { data } = await baseQuery
          .eq('relation_label', 'commitment')
          .is('valid_to', null)
          .order('valid_from', { ascending: false })
          .limit(5);
        intentData = data || [];
      } else if (intent === 'slippage') {
        const { data } = await baseQuery
          .eq('relation_label', 'delayed_on')
          .is('valid_to', null)
          .order('valid_from', { ascending: false })
          .limit(5);
        intentData = data || [];
      } else if (intent === 'change') {
        const { data } = await baseQuery
          .not('valid_to', 'is', null)
          .order('valid_to', { ascending: false })
          .limit(5);
        intentData = data || [];
      }
    }

    // 5. Return the strict IRIS API v0 Schema
    return NextResponse.json({
      understanding: {
        answer,
        confidence,
        temporal_validity: {
          believed_since: new Date().toISOString(),
          is_current: true
        },
        receipts: finalReceipts,
        intent,
        intent_data: intentData
      }
    }, { status: 200 });

  } catch (error) {
    console.error("[IRIS API v0] Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

