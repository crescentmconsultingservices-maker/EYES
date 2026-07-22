import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const observation = body.observation?.trim();

    if (!observation) {
      return NextResponse.json({ error: 'Missing observation content' }, { status: 400 });
    }

    // "The Observation Door": Data is only written via API, not directly to the knowledge graph.
    // We insert it as raw evidence so the Chronic ingestion loop can process it later.
    const { error: insertError } = await supabase
      .from('memories')
      .insert({
        user_id: user.id,
        platform: 'iris-api',
        event_type: 'observation',
        title: 'User Observation',
        content: observation,
        timestamp: new Date().toISOString(),
        author: user.email || 'user',
      });

    if (insertError) {
      console.error('[IRIS Observation Door] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to record observation' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Observation recorded.' }, { status: 200 });

  } catch (error) {
    console.error("[IRIS Observation Door] Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
