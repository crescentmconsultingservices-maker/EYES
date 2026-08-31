import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateValuation } from '@/core/valuation/calculator';


export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scan_id } = await req.json();
    if (!scan_id) {
      return NextResponse.json({ error: 'Missing scan_id' }, { status: 400 });
    }

    // 1. Fetch scan details
    const { data: scan } = await supabase.from('leak_scans').select('*').eq('scan_id', scan_id).single();
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

    // 2. Fetch all valid leaks
    const { data: leaks } = await supabase
      .from('leak_scan_threads')
      .select('*')
      .eq('scan_id', scan_id)
      .neq('leak_type', 'NOT_A_LEAK')
      .neq('leak_type', 'INVALID');

    if (!leaks || leaks.length === 0) {
      return NextResponse.json({ error: 'No leaks found for this scan' }, { status: 404 });
    }

    // 2b. Fetch actual total scanned threads for accurate reporting
    const { count: totalThreadsScanned } = await supabase
      .from('leak_scan_threads')
      .select('*', { count: 'exact', head: true })
      .eq('scan_id', scan_id);

    // 3. Aggregation & Deduplication
    const defaultFee = scan.client_stated_fee || 7000;
    const dedupedMap = new Map();

    for (const leak of leaks) {
      if (!leak.evidence) continue;

      // Deduplicate by domain if valid, otherwise preserve each unique leak separately
      const domain = leak.counterparty_domain;
      const dedupeKey = domain && domain !== 'unknown_domain' ? domain : `unknown_${leak.id}`;
      const existing = dedupedMap.get(dedupeKey);
      
      const daysSilent = leak.days_silent || 0;
      
      // Calculate using pure core function
      const valuation = calculateValuation({
        leakType: leak.leak_type,
        daysSilent,
        valueTier: leak.value_tier,
        estValueEur: leak.est_value_eur,
        quantity: leak.quantity,
        unitPrice: leak.unit_price,
        defaultFee
      });

      leak.value_tier = valuation.finalTier;
      leak.est_value_eur = valuation.grossValue;
      leak.recoverable_value_eur = valuation.recoverableValue;
      leak._rank_score = valuation.rankScore;

      // Keep highest value/rank if duplicate domain
      if (!existing || leak._rank_score > existing._rank_score) {
        dedupedMap.set(dedupeKey, leak);
      }
    }

    const finalLeaks = Array.from(dedupedMap.values()).sort((a, b) => b._rank_score - a._rank_score);

    // 4. Compute Summary Stats
    const totalThreadsFlagged = finalLeaks.length;
    const totalGrossValue = finalLeaks.reduce((sum, l) => sum + (l.est_value_eur || 0), 0);
    const totalRecoverableValue = finalLeaks.reduce((sum, l) => sum + (l.recoverable_value_eur || 0), 0);
    
    let oldestLeakAge = 0;
    const countsPerType = {
      OPEN_PROPOSAL: 0,
      GHOSTED_CLIENT: 0,
      DROPPED_COMMITMENT: 0,
      UNANSWERED_INBOUND: 0
    };

    finalLeaks.forEach(l => {
      if (countsPerType[l.leak_type as keyof typeof countsPerType] !== undefined) {
        countsPerType[l.leak_type as keyof typeof countsPerType]++;
      }
      if (l.days_silent > oldestLeakAge) oldestLeakAge = l.days_silent;
    });

    const reportJson = {
      scan_id,
      user_id: scan.user_id,
      summary: {
        total_threads_scanned: totalThreadsScanned || 0,
        threads_flagged: totalThreadsFlagged,
        total_gross_value_eur: totalGrossValue,
        total_value_eur: totalGrossValue, // Added alias to support frontend UI expects
        total_recoverable_value_eur: totalRecoverableValue,
        oldest_leak_age_days: oldestLeakAge,
        counts: countsPerType
      },
      leaks: finalLeaks
    };

    // 5. Generate Teaser HTML (we'll just return the JSON for the frontend to render, 
    // or return raw HTML string if requested)
    
    // As per the directive, we bind to the HTML templates.
    // In Vercel, running headless Chrome is heavy, so we will generate the raw HTML strings
    // which the Founder Office can immediately print to PDF natively via browser or a microservice.
    
    // We would do template string replacement here.
    // For simplicity in this roadmap step, we return the structured JSON report 
    // and a confirmation of success so the UI can handle the HTML.

    return NextResponse.json({ 
      success: true, 
      message: 'Aggregation complete. Ready for render.',
      report: reportJson 
    });

  } catch (err: any) {
    console.error('[Leak Scan Aggregation] Uncaught exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
