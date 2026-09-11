import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runChronicDedupe, runChronicDecay } from '@/services/graph/maintenance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. Verify Authorization
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch all unique users with active chronic edges or nodes
    const [edgesRes, nodesRes] = await Promise.all([
      supabase.from('chronic_edges').select('user_id').is('valid_to', null).limit(1000),
      supabase.from('chronic_nodes').select('user_id').limit(1000),
    ]);

    const userSet = new Set<string>();
    for (const row of edgesRes.data || []) {
      if (row.user_id) userSet.add(row.user_id);
    }
    for (const row of nodesRes.data || []) {
      if (row.user_id) userSet.add(row.user_id);
    }

    const uniqueUsers = Array.from(userSet);

    if (uniqueUsers.length === 0) {
      return NextResponse.json({ status: 'no_active_users', usersProcessed: 0 });
    }

    console.log(`[Cron: Chronic] Executing native graph maintenance for ${uniqueUsers.length} users...`);

    // 3. Run Native TypeScript Deduplication & Decay per user
    const results = await Promise.allSettled(
      uniqueUsers.map(async (userId) => {
        const dedupe = await runChronicDedupe(supabase, userId);
        const decay = await runChronicDecay(supabase, userId);
        return { userId, dedupe, decay };
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      status: 'success',
      usersProcessed: uniqueUsers.length,
      successful,
      failed,
      details: results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { userId: uniqueUsers[i], error: String((r as PromiseRejectedResult).reason) }
      ),
    });
  } catch (err) {
    console.error('[Cron] Chronic Maintenance failed:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
