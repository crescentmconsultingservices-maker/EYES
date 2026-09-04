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

    // 2. Fetch all unique combinations of user, organization, and scope
    const { data: scopes, error } = await supabase
      .from('chronic_edges')
      .select('user_id, organization_id, scope')
      .is('valid_to', null);

    if (error) throw error;
    if (!scopes || scopes.length === 0) {
      return NextResponse.json({ status: 'no_active_users' });
    }

    // Deduplicate combinations
    const uniqueScopes = Array.from(new Set(scopes.map(s => JSON.stringify({ 
      user_id: s.user_id, 
      organization_id: s.organization_id, 
      scope: s.scope 
    })))).map(s => JSON.parse(s));
    
    const CHRONIC_ENGINE_URL = process.env.CHRONIC_ENGINE_URL || 'http://127.0.0.1:8000';
    const CHRONIC_ENGINE_SECRET = process.env.CHRONIC_ENGINE_SECRET || '';

    // 3. Fire the Python Engine endpoints for each combination
    const results = await Promise.allSettled(
      uniqueScopes.map(async (scopeData) => {
        const headers = {
          'Content-Type': 'application/json',
          ...(CHRONIC_ENGINE_SECRET && { 'X-Engine-Secret': CHRONIC_ENGINE_SECRET })
        };

        // Fire Dedupe (Phase 3)
        const dedupeRes = await fetch(`${CHRONIC_ENGINE_URL}/cron/dedupe`, {
          method: 'POST',
          headers,
          body: JSON.stringify(scopeData)
        });

        // Fire Decay (Phase 4)
        const decayRes = await fetch(`${CHRONIC_ENGINE_URL}/cron/decay`, {
          method: 'POST',
          headers,
          body: JSON.stringify(scopeData)
        });

        return { ...scopeData, dedupeOk: dedupeRes.ok, decayOk: decayRes.ok };
      })
    );

    return NextResponse.json({ status: 'success', jobs_dispatched: results.length });
  } catch (err) {
    console.error('[Cron] Chronic Engine trigger failed:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
