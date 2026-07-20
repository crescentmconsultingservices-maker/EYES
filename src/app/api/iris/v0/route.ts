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
Respond in strict JSON format:
{
  "answer": "your answer here",
  "confidence": 0.0 to 1.0,
  "used_evidence_ids": [] // List the IDs of the evidence you ACTUALLY used. Leave empty if none were used (e.g. for greetings).
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

    try {
      if (typeof rawResponse === 'string') {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          answer = parsed.answer || answer;
          confidence = parsed.confidence || 0.0;
          
          const usedIds = Array.isArray(parsed.used_evidence_ids) ? parsed.used_evidence_ids : [];
          finalReceipts = allReceipts
            .filter(r => usedIds.includes(r.id))
            .map(r => ({ source_url: r.source_url, span: r.span }));
        }
      }
    } catch (e) {
      answer = typeof rawResponse === 'string' ? rawResponse : answer;
    }

    // 4. Return the strict IRIS API v0 Schema
    return NextResponse.json({
      understanding: {
        answer,
        confidence,
        temporal_validity: {
          believed_since: new Date().toISOString(),
          is_current: true
        },
        receipts: finalReceipts
      }
    }, { status: 200 });

  } catch (error) {
    console.error("[IRIS API v0] Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

