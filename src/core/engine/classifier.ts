import { LEAK_DETECTION_PROMPT } from '@/prompts/leak_scan_prompts';

const CONFIDENCE_GATE = 0.80;

export interface DetectionResult {
  leak_type: string;
  confidence: number;
  counterparty_name?: string;
  counterparty_domain?: string;
  days_silent?: number;
  evidence?: any;
  recovery_angle?: string;
  value_tier?: string;
  quantity?: number;
  unit_price?: number;
  unit_hint?: string;
  stated_value_eur?: number;
  error?: string;
}

export async function classifyThread(
  rawTranscript: any[], 
  litellmUrl: string, 
  litellmKey: string
): Promise<DetectionResult> {
  if (!rawTranscript || !Array.isArray(rawTranscript)) {
    return { leak_type: 'INVALID', confidence: 0, error: 'Invalid transcript array' };
  }

  // Build text payload for LLM
  let threadText = '';
  for (const msg of rawTranscript) {
    threadText += `\n[ID: ${msg.message_id} | Date: ${msg.timestamp} | From: ${msg.from} | Dir: ${msg.direction}]\n${msg.content}\n`;
  }

  try {
    const response = await fetch(`${litellmUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`
      },
      body: JSON.stringify({
        model: "claude-haiku",
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
      return { leak_type: 'INVALID', confidence: 0, error: `LLM HTTP Error: ${errText}` };
    }

    const llmResult = await response.json();
    const content = llmResult.choices?.[0]?.message?.content;
    
    if (!content) {
      return { leak_type: 'INVALID', confidence: 0, error: 'Empty LLM response' };
    }

    let parsed;
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found in response');
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return { leak_type: 'INVALID', confidence: 0, error: `JSON Parse Error: ${content}` };
    }

    // Verbatim Substring Check & Confidence Gate
    if (parsed.confidence >= CONFIDENCE_GATE && parsed.leak_type && parsed.evidence) {
      const quotedLine = parsed.evidence.quoted_line;
      let verbatimMatch = false;

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

    return parsed;

  } catch (err: any) {
    return { leak_type: 'INVALID', confidence: 0, error: String(err) };
  }
}
