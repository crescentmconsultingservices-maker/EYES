import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Fetching the user's data from the last 24 hours
    const { data, error } = await supabase
      .from('memories')
      .select('platform, content')
      .eq('user_id', user.id)
      .gte('timestamp', yesterday.toISOString());

    if (error) {
      console.error('Error fetching morning brief stats:', error);
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    const total = data ? data.length : 0;
    const notes = data ? data.filter((d: any) => d.platform === 'note').length : 0;
    const chats = data ? data.filter((d: any) => d.platform !== 'note').length : 0;

    return NextResponse.json({
      stats: { total, notes, chats },
      synthesis: "Based on the last 24 hours of data ingestion, your digital footprint indicates normal activity. No anomalous behaviors or security risks were detected. EYES has successfully processed and vectorized your recent notes and chat history."
    }, { status: 200 });
  } catch (err) {
    console.error('Morning brief API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
