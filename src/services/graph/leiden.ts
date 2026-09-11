import { invokeModel } from '@/services/ai/ai';
import crypto from 'crypto';

export interface GraphNode {
  id: string;
  name: string;
  label: string;
  attributes?: Record<string, unknown>;
}

export interface GraphEdge {
  head_node_id: string;
  tail_node_id: string;
  relation_label?: string;
  confidence?: number;
}

export interface DetectedCommunity {
  id: string;
  label: string;
  description: string;
  characteristics: string[];
  nodeIds: string[];
  memberCount: number;
}

/**
 * Modularity-based Leiden/Louvain community detection algorithm in pure TypeScript.
 * Groups graph vertices into cohesive cognitive subgraphs maximizing network modularity:
 * Q = (1 / 2m) * sum_ij [ A_ij - (k_i * k_j) / (2m) ] * delta(c_i, c_j)
 */
export function detectCommunities(
  nodeIds: string[],
  edges: GraphEdge[],
  resolution: number = 0.5
): Map<number, string[]> {
  if (nodeIds.length === 0) return new Map();
  if (edges.length === 0) {
    // Return each node as separate community
    const emptyMap = new Map<number, string[]>();
    nodeIds.forEach((id, idx) => emptyMap.set(idx, [id]));
    return emptyMap;
  }

  // Build adjacency map with weights
  const adj = new Map<string, Map<string, number>>();
  for (const n of nodeIds) {
    adj.set(n, new Map());
  }

  let totalWeight = 0;
  for (const edge of edges) {
    const { head_node_id: u, tail_node_id: v } = edge;
    if (!u || !v || u === v) continue;
    if (!adj.has(u)) adj.set(u, new Map());
    if (!adj.has(v)) adj.set(v, new Map());

    const weight = Math.max(0.01, Number(edge.confidence ?? 1.0));
    const currUW = adj.get(u)!.get(v) || 0;
    adj.get(u)!.set(v, currUW + weight);

    const currVW = adj.get(v)!.get(u) || 0;
    adj.get(v)!.set(u, currVW + weight);

    totalWeight += weight;
  }

  const allNodes = Array.from(adj.keys());
  if (totalWeight === 0 || allNodes.length === 0) {
    const fallback = new Map<number, string[]>();
    allNodes.forEach((id, idx) => fallback.set(idx, [id]));
    return fallback;
  }

  const m2 = 2 * totalWeight;

  // Degrees (k_i)
  const degrees = new Map<string, number>();
  for (const u of allNodes) {
    let d = 0;
    for (const w of adj.get(u)!.values()) {
      d += w;
    }
    degrees.set(u, d);
  }

  // Initial partition: each node in its own community
  const nodeComm = new Map<string, number>();
  const commTot = new Map<number, number>(); // sum of degrees of all nodes in community

  allNodes.forEach((node, idx) => {
    nodeComm.set(node, idx);
    commTot.set(idx, degrees.get(node) || 0);
  });

  let improved = true;
  let passes = 0;
  const maxPasses = 25;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;

    for (const u of allNodes) {
      const curComm = nodeComm.get(u)!;
      const k_u = degrees.get(u) || 0;
      if (k_u === 0) continue;

      // Calculate weights from u to all neighboring communities
      const commWeights = new Map<number, number>();
      for (const [v, w] of adj.get(u)!.entries()) {
        const vComm = nodeComm.get(v)!;
        commWeights.set(vComm, (commWeights.get(vComm) || 0) + w);
      }

      // Remove u from its current community
      const currentTot = commTot.get(curComm)! - k_u;
      commTot.set(curComm, currentTot);

      const k_u_in_cur = commWeights.get(curComm) || 0;
      const curCost = (k_u_in_cur / m2) - (resolution * (currentTot * k_u) / (m2 * totalWeight));

      let bestComm = curComm;
      let bestGain = 0;

      for (const [targetComm, k_u_in] of commWeights.entries()) {
        if (targetComm === curComm) continue;
        const targetTot = commTot.get(targetComm) || 0;
        const gain = (k_u_in / m2) - (resolution * (targetTot * k_u) / (m2 * totalWeight)) - curCost;

        if (gain > bestGain) {
          bestGain = gain;
          bestComm = targetComm;
        }
      }

      // Move node to best community
      nodeComm.set(u, bestComm);
      commTot.set(bestComm, (commTot.get(bestComm) || 0) + k_u);

      if (bestComm !== curComm) {
        improved = true;
      }
    }
  }

  // Group nodes by community ID
  const grouped = new Map<number, string[]>();
  for (const [node, comm] of nodeComm.entries()) {
    if (!grouped.has(comm)) grouped.set(comm, []);
    grouped.get(comm)!.push(node);
  }

  // Re-index cleanly from 0..N-1
  const finalCommunities = new Map<number, string[]>();
  let nextId = 0;
  for (const members of grouped.values()) {
    finalCommunities.set(nextId++, members);
  }

  return finalCommunities;
}

/**
 * Fetch all active chronic edges for a specific user.
 */
export async function fetchAllActiveEdges(
  supabase: any,
  userId: string,
  batchSize: number = 1000
): Promise<GraphEdge[]> {
  const allEdges: GraphEdge[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('chronic_edges')
      .select('head_node_id, tail_node_id, relation_label, confidence')
      .eq('user_id', userId)
      .is('valid_to', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error(`[Leiden] Error fetching edges for user ${userId}:`, error.message);
      break;
    }

    const chunk = (data || []) as GraphEdge[];
    allEdges.push(...chunk);

    if (chunk.length < batchSize) break;
    offset += batchSize;
  }

  return allEdges;
}

/**
 * Fetch chronic nodes for a given list of node IDs.
 */
export async function fetchNodesByIds(
  supabase: any,
  userId: string,
  nodeIds: string[]
): Promise<Map<string, GraphNode>> {
  const nodeMap = new Map<string, GraphNode>();
  if (nodeIds.length === 0) return nodeMap;

  const chunkSize = 200;
  for (let i = 0; i < nodeIds.length; i += chunkSize) {
    const batch = nodeIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('chronic_nodes')
      .select('id, name, label, attributes')
      .eq('user_id', userId)
      .in('id', batch);

    if (!error && data) {
      for (const n of data) {
        nodeMap.set(n.id, n as GraphNode);
      }
    }
  }

  return nodeMap;
}

/**
 * Executes graph community detection on chronic_edges for a user and writes clusters
 * into cognitive_clusters.
 */
export async function runGraphCommunityClustering(
  supabase: any,
  userId: string
): Promise<number> {
  console.log(`[Leiden] Starting Graph Community Detection for user ${userId.slice(0, 8)}...`);

  // 1. Fetch active edges
  const edges = await fetchAllActiveEdges(supabase, userId);
  if (!edges || edges.length === 0) {
    console.log(`[Leiden] No active chronic edges found for user ${userId.slice(0, 8)}. Skipping.`);
    return 0;
  }

  // 2. Collect unique node IDs
  const nodeIdsSet = new Set<string>();
  for (const e of edges) {
    if (e.head_node_id) nodeIdsSet.add(e.head_node_id);
    if (e.tail_node_id) nodeIdsSet.add(e.tail_node_id);
  }
  const allNodeIds = Array.from(nodeIdsSet);

  // 3. Run Community Detection
  const communities = detectCommunities(allNodeIds, edges);
  console.log(`[Leiden] Discovered ${communities.size} communities across ${allNodeIds.length} nodes.`);

  // 4. Fetch node metadata for labeling
  const nodeMap = await fetchNodesByIds(supabase, userId, allNodeIds);

  // 5. Build cluster records for communities of size >= 2
  const clustersToUpsert: any[] = [];
  let clusterIndex = 0;

  for (const [, memberNodeIds] of communities.entries()) {
    if (memberNodeIds.length < 2) continue; // Skip singletons

    clusterIndex++;
    const memberNodes = memberNodeIds
      .map(id => nodeMap.get(id))
      .filter((n): n is GraphNode => Boolean(n));

    const entityNames = memberNodes.map(n => n.name).slice(0, 10);
    const dominantLabels = memberNodes.map(n => n.label).slice(0, 5);

    // Heuristic label and description
    let label = `Cognitive Subgraph #${clusterIndex}`;
    let description = `Grouped community of ${memberNodeIds.length} interconnected knowledge graph entities.`;
    const characteristics = entityNames;

    if (entityNames.length >= 2) {
      label = `${entityNames[0]} & ${entityNames[1]} Subgraph`;
    }

    // Attempt AI-assisted labeling via gateway if available
    try {
      const summaryContext = memberNodes.slice(0, 12).map(n => `${n.name} (${n.label})`).join(', ');
      const aiResponse = await invokeModel({
        capability: 'classify',
        system: 'You are EYES Graph Intelligence. Generate a concise 3-5 word label and 1 sentence description for a knowledge graph cluster. Respond in JSON only: {"label":"...","description":"..."}',
        messages: [{
          role: 'user',
          content: `Cluster entities: ${summaryContext}`,
        }],
        preference: 'auto',
        capture: false,
      });

      if (aiResponse && typeof aiResponse === 'string') {
        const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.label) label = parsed.label;
          if (parsed.description) description = parsed.description;
        }
      }
    } catch {
      // Retain heuristic label on AI failure
    }

    const clusterUuid = crypto.randomUUID();
    const clusterId = `graph-cluster-${clusterIndex}-${clusterUuid.slice(0, 8)}`;

    clustersToUpsert.push({
      id: clusterUuid,
      user_id: userId,
      cluster_id: clusterId,
      cluster_label: label,
      cluster_description: description,
      characteristics,
      occurrence_count: memberNodeIds.length,
      is_current: true,
      last_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (clustersToUpsert.length > 0) {
    // Mark previous graph clusters as non-current or insert
    await supabase
      .from('cognitive_clusters')
      .update({ is_current: false })
      .eq('user_id', userId)
      .like('cluster_id', 'graph-cluster-%');

    // Batch insert
    const chunkSize = 100;
    for (let i = 0; i < clustersToUpsert.length; i += chunkSize) {
      const chunk = clustersToUpsert.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('cognitive_clusters')
        .upsert(chunk, { onConflict: 'user_id,cluster_id' });

      if (error) {
        console.error('[Leiden] Error saving cognitive clusters:', error.message);
      }
    }
  }

  console.log(`[Leiden] Saved ${clustersToUpsert.length} graph clusters for user ${userId.slice(0, 8)}.`);
  return clustersToUpsert.length;
}
