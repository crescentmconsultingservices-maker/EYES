// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

export interface DedupeResult {
  userId: string;
  mergedCount: number;
  remainingNodes: number;
}

export interface DecayResult {
  userId: string;
  escalatedCount: number;
  decayedCount: number;
}

/**
 * Deterministic Entity Deduplication (Phase 3.B)
 * Merges duplicate nodes in chronic_nodes by normalized name (case-insensitive, trimmed).
 * Preserves the oldest node as canonical and updates chronic_edges pointing to duplicates.
 */
export async function runChronicDedupe(
  supabase: SupabaseAdminClient,
  userId: string
): Promise<DedupeResult> {
  console.log(`[Chronic Dedupe] Starting deduplication for user ${userId.slice(0, 8)}...`);

  const { data: nodes, error } = await supabase
    .from('chronic_nodes')
    .select('id, name, created_at')
    .eq('user_id', userId);

  if (error) {
    console.error(`[Chronic Dedupe] Error fetching nodes for ${userId}:`, error.message);
    return { userId, mergedCount: 0, remainingNodes: 0 };
  }

  if (!nodes || nodes.length === 0) {
    return { userId, mergedCount: 0, remainingNodes: 0 };
  }

  // Group nodes by normalized exact match
  const clusters = new Map<string, Array<{ id: string; name: string; created_at?: string }>>();
  for (const node of nodes) {
    const norm = String(node.name || '').toLowerCase().trim();
    if (!norm) continue;
    if (!clusters.has(norm)) clusters.set(norm, []);
    clusters.get(norm)!.push(node);
  }

  let mergedCount = 0;

  for (const [, group] of clusters.entries()) {
    if (group.length <= 1) continue;

    // Sort by created_at to keep the oldest node as canonical
    group.sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tA - tB;
    });

    const canonicalNode = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      try {
        // Point edges referencing dup head to canonical
        await supabase
          .from('chronic_edges')
          .update({ head_node_id: canonicalNode.id })
          .eq('head_node_id', dup.id)
          .eq('user_id', userId);

        // Point edges referencing dup tail to canonical
        await supabase
          .from('chronic_edges')
          .update({ tail_node_id: canonicalNode.id })
          .eq('tail_node_id', dup.id)
          .eq('user_id', userId);

        // Delete duplicate node
        await supabase
          .from('chronic_nodes')
          .delete()
          .eq('id', dup.id)
          .eq('user_id', userId);

        mergedCount++;
      } catch (err) {
        console.warn(`[Chronic Dedupe] Warning merging duplicate ${dup.id} -> ${canonicalNode.id}:`, err);
      }
    }
  }

  console.log(`[Chronic Dedupe] Finished user ${userId.slice(0, 8)}: merged ${mergedCount} duplicates.`);
  return {
    userId,
    mergedCount,
    remainingNodes: nodes.length - mergedCount,
  };
}

/**
 * Behavioral Decay & Drift Engine (Phase 4)
 * Finds knowledge graph edges that have not been reinforced recently (>= 30 days)
 * - Commitment edges that went quiet escalate to 'delayed_on'
 * - Factual/identity edges (works_at, located_in, etc.) never decay on silence
 * - Mention/frequency edges fade by setting valid_to = now()
 */
export async function runChronicDecay(
  supabase: SupabaseAdminClient,
  userId: string,
  decayThresholdDays: number = 30
): Promise<DecayResult> {
  console.log(`[Chronic Decay] Starting decay analysis for user ${userId.slice(0, 8)}...`);

  const cutoffDate = new Date(Date.now() - decayThresholdDays * 86400000).toISOString();

  // Fetch active edges (valid_to is null)
  const { data: edges, error } = await supabase
    .from('chronic_edges')
    .select('id, head_node_id, tail_node_id, relation_label, observed_from')
    .eq('user_id', userId)
    .is('valid_to', null);

  if (error) {
    console.error(`[Chronic Decay] Error fetching edges for ${userId}:`, error.message);
    return { userId, escalatedCount: 0, decayedCount: 0 };
  }

  if (!edges || edges.length === 0) {
    return { userId, escalatedCount: 0, decayedCount: 0 };
  }

  // Group by relation: head::tail::relation_label
  const relationGroups = new Map<string, Array<{ id: string; relation_label: string; observed_from?: string }>>();
  for (const edge of edges) {
    const key = `${edge.head_node_id}::${edge.tail_node_id}::${edge.relation_label}`;
    if (!relationGroups.has(key)) relationGroups.set(key, []);
    relationGroups.get(key)!.push(edge);
  }

  const factualRelations = new Set([
    'works_at',
    'member_of',
    'located_in',
    'family_of',
    'parent_of',
    'child_of',
    'spouse_of',
    'sibling_of',
    'friend_of',
    'knows',
  ]);

  const edgesToEscalate: string[] = [];
  const edgesToDecay: string[] = [];

  for (const [, group] of relationGroups.entries()) {
    // Check most recent observation in this group
    let mostRecentTime = 0;
    let mostRecentObs = group[0];

    for (const item of group) {
      const t = item.observed_from ? new Date(item.observed_from).getTime() : 0;
      if (t >= mostRecentTime) {
        mostRecentTime = t;
        mostRecentObs = item;
      }
    }

    const obsDateStr = mostRecentObs.observed_from || new Date(0).toISOString();
    if (obsDateStr < cutoffDate) {
      const relation = String(mostRecentObs.relation_label || '').toLowerCase().trim();

      if (relation === 'commitment') {
        for (const e of group) edgesToEscalate.push(e.id);
      } else if (factualRelations.has(relation)) {
        // Identity / factual relations end only on contradicting evidence
        continue;
      } else {
        // Mention-frequency fades with silence
        for (const e of group) edgesToDecay.push(e.id);
      }
    }
  }

  const now = new Date().toISOString();

  // Escalate stale commitments to 'delayed_on'
  if (edgesToEscalate.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < edgesToEscalate.length; i += chunkSize) {
      const chunk = edgesToEscalate.slice(i, i + chunkSize);
      await supabase
        .from('chronic_edges')
        .update({ relation_label: 'delayed_on', updated_at: now })
        .in('id', chunk);
    }
  }

  // Decay stale mention edges (set valid_to = now)
  if (edgesToDecay.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < edgesToDecay.length; i += chunkSize) {
      const chunk = edgesToDecay.slice(i, i + chunkSize);
      await supabase
        .from('chronic_edges')
        .update({ valid_to: now, updated_at: now })
        .in('id', chunk);
    }
  }

  console.log(
    `[Chronic Decay] User ${userId.slice(0, 8)}: ${edgesToEscalate.length} escalated to delayed_on, ${edgesToDecay.length} shifted to historic.`
  );

  return {
    userId,
    escalatedCount: edgesToEscalate.length,
    decayedCount: edgesToDecay.length,
  };
}
