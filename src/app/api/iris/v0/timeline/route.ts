import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from('memories')
      .select('id, platform, timestamp, title, content, event_type')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching timeline data:', error);
      return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
    }

    return NextResponse.json({ events: data || [] }, { status: 200 });
  } catch (err) {
    console.error('Timeline API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
