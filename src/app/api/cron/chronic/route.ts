import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron Secret for securing the endpoint
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    // 1. Verify Authorization
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Get all distinct active users from chronic_edges
    const { data: users, error } = await supabase
      .from('chronic_edges')
      .select('user_id')
      .is('valid_to', null);

    if (error) throw error;
    if (!users || users.length === 0) {
      return NextResponse.json({ status: 'no_active_users' });
    }

    // Deduplicate user IDs
    const uniqueUsers = Array.from(new Set(users.map(u => u.user_id)));
    
    const CHRONIC_ENGINE_URL = process.env.CHRONIC_ENGINE_URL || 'http://127.0.0.1:8000';
    const CHRONIC_ENGINE_SECRET = process.env.CHRONIC_ENGINE_SECRET || '';

    // 3. Fire the Python Engine endpoints for each user
    const results = await Promise.allSettled(
      uniqueUsers.map(async (userId) => {
        const headers = {
          'Content-Type': 'application/json',
          ...(CHRONIC_ENGINE_SECRET && { 'X-Engine-Secret': CHRONIC_ENGINE_SECRET })
        };

        // Fire Dedupe (Phase 3)
        const dedupeRes = await fetch(`${CHRONIC_ENGINE_URL}/cron/dedupe`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_id: userId })
        });

        // Fire Decay (Phase 4)
        const decayRes = await fetch(`${CHRONIC_ENGINE_URL}/cron/decay`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ user_id: userId })
        });

        return { userId, dedupeOk: dedupeRes.ok, decayOk: decayRes.ok };
      })
    );

    return NextResponse.json({ status: 'success', jobs_dispatched: results.length });
  } catch (err) {
    console.error('[Cron] Chronic Engine trigger failed:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
