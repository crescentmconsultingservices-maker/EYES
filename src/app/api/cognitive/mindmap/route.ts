import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    // Auth guard — always use the session user, never trust ?userId= from URL
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // 1. Fetch raw edges from chronic_edges
    const { data: edges, error: edgeError } = await supabase
      .from('chronic_edges')
      .select('*')
      .eq('user_id', userId)
      .limit(100);

    if (edgeError) throw edgeError;

    // 2. Fetch Entity Correlations (from Splink Batch) to merge duplicate nodes
    const { data: correlations } = await supabase
      .from('entity_correlations')
      .select('*')
      .eq('user_id', userId);

    // Mapping duplicate nodes to their cluster name
    const nodeMap = new Map<string, string>();
    if (correlations) {
      correlations.forEach(c => {
        nodeMap.set(c.entity_id, c.entity_name);
      });
    }

    // 3. Format graph for frontend
    const nodes = new Set<string>();
    const graphEdges = (edges || []).map(e => {
      const head = nodeMap.get(e.head_node_id) || e.head_node_id;
      const tail = nodeMap.get(e.tail_node_id) || e.tail_node_id;

      nodes.add(head);
      nodes.add(tail);

      return {
        source: head,
        target: tail,
        label: e.relation_label,
        confidence: e.confidence
      };
    });

    const graphNodes = Array.from(nodes).map(id => ({
      id,
      label: id.replace(/_/g, ' ')
    }));

    return NextResponse.json({
      nodes: graphNodes,
      edges: graphEdges,
      merged_nodes_count: correlations?.length || 0
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
