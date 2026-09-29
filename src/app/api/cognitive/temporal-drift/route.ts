import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** Escape special ILIKE wildcard characters to prevent unexpected matches. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Phase 4.A Temporal Aggregation: Count mentions of specific entities over time.
    // Get all active edges for the user
    const { data: edges, error } = await supabase
        .from('chronic_edges')
        .select('tail_node_id, observed_from')
        .eq('user_id', userId)
        .is('valid_to', null);
        
    if (error) throw error;
    
    if (!edges || edges.length === 0) {
        return NextResponse.json({ gaps: [] });
    }

    // Build entity frequency map
    const entityCounts = new Map<string, number>();
    edges.forEach(e => {
        const count = entityCounts.get(e.tail_node_id) || 0;
        entityCounts.set(e.tail_node_id, count + 1);
    });

    // Sort all entities by frequency — analyze top 5 instead of just the single top entity (Bug #17)
    const topEntities = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topEntities.length === 0) {
        return NextResponse.json({ gaps: [] });
    }

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Phase 4.D: Compute drift for each top entity in parallel
    const driftGaps = await Promise.all(topEntities.map(async ([entityId, historicCount]) => {
      // Replace underscores with spaces for display; escape for ILIKE (Bug #6)
      const entityName = entityId.replace(/_/g, ' ');
      const escapedName = escapeLikePattern(entityName);

      const { count: recentMentions } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .ilike('content', `%${escapedName}%`)
        .gte('timestamp', thirtyDaysAgo);

      const { count: yearMentions } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .ilike('content', `%${escapedName}%`)
        .gte('timestamp', oneYearAgo);

      const pastCount = yearMentions ?? historicCount;
      const currCount = recentMentions ?? 0;

      return {
        stated: `You historically engaged with ${entityName} frequently.`,
        lived: `Your recent activity reflects ${currCount} mention${currCount === 1 ? '' : 's'} in the last 30 days vs ${pastCount} over the past year.`,
        gap_summary: `Activity around ${entityName} shifted from ${pastCount} mentions historically to ${currCount} recently.`,
      };
    }));

    // Upsert drift snapshot — one row per user per period_start, not a new row per request (Bug #7)
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('drift_snapshots').upsert(
      [{
        user_id: userId,
        period_start: periodStart,
        period_end: new Date().toISOString(),
        gaps: driftGaps,
      }],
      { onConflict: 'user_id,period_start', ignoreDuplicates: false }
    );

    return NextResponse.json({ gaps: driftGaps });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
