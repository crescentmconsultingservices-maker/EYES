import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIds = [user.id];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 9 }, (_, i) => currentYear - (8 - i));

    const statsPromises = years.map(async (year) => {
      const start = `${year}-01-01T00:00:00Z`;
      const end = `${year}-12-31T23:59:59Z`;

      const { count, error } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .in('user_id', userIds)
        .gte('timestamp', start)
        .lte('timestamp', end);

      if (error) throw error;
      return { year: year.toString(), count: count || 0 };
    });

    const timelineData = await Promise.all(statsPromises);
    const totalCount = timelineData.reduce((acc, curr) => acc + curr.count, 0);

    // Fetch chronological timeline event items
    const { data: recentEvents } = await supabase
      .from('memories')
      .select('id, platform, title, content, timestamp, author, event_type')
      .in('user_id', userIds)
      .order('timestamp', { ascending: false })
      .limit(20);

    return NextResponse.json({
      timelineData,
      events: recentEvents || []
    });
  } catch (err) {
    console.warn('Timeline stats error:', err);
    return NextResponse.json({
      timelineData: [],
      events: []
    }, { status: 200 });
  }
}
