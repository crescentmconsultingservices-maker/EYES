import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify cron secret to prevent unauthorized runs
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Leak Scan Purge] Starting nightly purge job...');

    // Delete scans where purge_at is in the past
    // The ON DELETE CASCADE on leak_scan_threads will automatically clean up the child records
    const { data, error } = await supabase
      .from('leak_scans')
      .delete()
      .lt('purge_at', new Date().toISOString())
      .select('scan_id');

    if (error) {
      console.error('[Leak Scan Purge] Error during deletion:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const purgedCount = data ? data.length : 0;
    console.log(`[Leak Scan Purge] Successfully purged ${purgedCount} expired namespaces.`);

    return NextResponse.json({ 
      success: true, 
      purged_count: purgedCount,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('[Leak Scan Purge] Uncaught exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
