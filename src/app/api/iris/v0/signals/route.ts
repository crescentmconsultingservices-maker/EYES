import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if the user is operating within an organization context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_type, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOrgMode = profile?.account_type === 'organization' && profile?.organization_id;

    let queryBuilder = supabase
      .from('alerts')
      .select('*, memory:memories!source_memory_id(content, source_url)');

    if (!isOrgMode) {
      queryBuilder = queryBuilder.eq('user_id', user.id);
    }

    const { data: alerts, error } = await queryBuilder
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching alerts:', error);
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ signals: [] }, { status: 200 });
    }

    // 2. Format for Strict AI Filter
    const evidenceText = alerts.map((a: any) => 
      `ALERT_ID: ${a.id}\nTITLE: ${a.title}\nBODY: ${a.body}\nTYPE: ${a.alert_type}\nMEMORY_URL: ${a.memory?.source_url || '#'}\n---`
    ).join('\n');

    const systemPrompt = `You are the IRIS Signals Engine. Review the provided system alerts from the Acute Layer.
Your job is to apply the STRICT FILTER. 

You must only pass an alert through if it meets AT LEAST ONE of these three criteria:
1. Changes a decision the user has made.
2. Prevents a mistake the user is about to make.
3. Reveals a time-sensitive opportunity.

If it does not meet those criteria, completely ignore it.

Respond in strict JSON format:
{
  "signals": [
    {
      "id": "original ALERT_ID",
      "type": "DECISION" | "MISTAKE" | "OPPORTUNITY",
      "title": "Short title",
      "desc": "Explanation of why this meets the criteria",
      "source_url": "original MEMORY_URL"
    }
  ]
}

If NO alerts meet the criteria, return {"signals": []}.

ALERTS:
${evidenceText}`;

    // 3. Invoke LLM for Strict Filtering
    const rawResponse = await invokeModel({
      capability: 'chat',
      messages: [{ role: 'user', content: 'Apply the strict filter to my recent alerts.' }],
      system: systemPrompt,
      preference: 'auto'
    });

    let signals: any[] = [];
    try {
      if (typeof rawResponse === 'string') {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          signals = parsed.signals || [];
        }
      }
    } catch (e) {
      console.error('Failed to parse Signals AI response:', e);
    }

    // Return the strictly filtered signals
    return NextResponse.json({ signals }, { status: 200 });

  } catch (err) {
    console.error('Signals API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
