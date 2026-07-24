import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

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

    // 1. Get embedding for the natural language query
    const embedResult = await invokeModel({
      capability: 'embed',
      messages: [{ role: 'user', content: query }],
      capture: false,
    });
    
    let embedding: number[] | null = null;
    if (embedResult && typeof embedResult === 'object' && 'embedding' in embedResult) {
      embedding = embedResult.embedding as number[];
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
    if (intent === 'commitment') {
      const { data } = await supabase
        .from('chronic_edges')
        .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
        .eq('user_id', user.id)
        .eq('relation_label', 'commitment')
        .is('valid_to', null)
        .order('valid_from', { ascending: false })
        .limit(5);
      intentData = data || [];
    } else if (intent === 'slippage') {
      const { data } = await supabase
        .from('chronic_edges')
        .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
        .eq('user_id', user.id)
        .eq('relation_label', 'delayed_on')
        .is('valid_to', null)
        .order('valid_from', { ascending: false })
        .limit(5);
      intentData = data || [];
    } else if (intent === 'change') {
      const { data } = await supabase
        .from('chronic_edges')
        .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
        .eq('user_id', user.id)
        .not('valid_to', 'is', null)
        .order('valid_to', { ascending: false })
        .limit(5);
      intentData = data || [];
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

