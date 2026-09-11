import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCommunities, runGraphCommunityClustering, GraphEdge } from '@/services/graph/leiden';

// Mock invokeModel
vi.mock('@/services/ai/ai', () => ({
  invokeModel: vi.fn().mockResolvedValue(JSON.stringify({
    label: 'AI Infrastructure & Model Ops',
    description: 'Knowledge cluster covering core deployment and machine learning infrastructure.',
  })),
}));

describe('Graph Community Detection (Leiden / Louvain)', () => {
  it('handles empty inputs gracefully', () => {
    const res = detectCommunities([], []);
    expect(res.size).toBe(0);
  });

  it('handles nodes with no edges', () => {
    const nodes = ['node-1', 'node-2', 'node-3'];
    const res = detectCommunities(nodes, []);
    expect(res.size).toBe(3);
  });

  it('correctly partitions two distinct cliques into separate communities', () => {
    // Clique 1: 1, 2, 3 strongly connected
    // Clique 2: 4, 5, 6 strongly connected
    // Weak bridge: 3 -> 4
    const nodes = ['1', '2', '3', '4', '5', '6'];
    const edges: GraphEdge[] = [
      // Clique 1
      { head_node_id: '1', tail_node_id: '2', confidence: 1.0 },
      { head_node_id: '2', tail_node_id: '3', confidence: 1.0 },
      { head_node_id: '1', tail_node_id: '3', confidence: 1.0 },
      // Clique 2
      { head_node_id: '4', tail_node_id: '5', confidence: 1.0 },
      { head_node_id: '5', tail_node_id: '6', confidence: 1.0 },
      { head_node_id: '4', tail_node_id: '6', confidence: 1.0 },
      // Weak bridge between cliques
      { head_node_id: '3', tail_node_id: '4', confidence: 0.05 },
    ];

    const communities = detectCommunities(nodes, edges);
    expect(communities.size).toBe(2);

    // Ensure clique 1 nodes are together and clique 2 nodes are together
    const comm1 = Array.from(communities.values()).find(c => c.includes('1'))!;
    const comm2 = Array.from(communities.values()).find(c => c.includes('4'))!;

    expect(comm1).toBeDefined();
    expect(comm2).toBeDefined();
    expect(comm1).toContain('2');
    expect(comm1).toContain('3');
    expect(comm2).toContain('5');
    expect(comm2).toContain('6');
    expect(comm1).not.toContain('4');
  });

  it('runGraphCommunityClustering saves clusters to Supabase', async () => {
    const mockEdges = [
      { head_node_id: 'n1', tail_node_id: 'n2', relation_label: 'CONNECTS_TO', confidence: 0.9 },
      { head_node_id: 'n2', tail_node_id: 'n3', relation_label: 'DEPENDS_ON', confidence: 0.9 },
      { head_node_id: 'n1', tail_node_id: 'n3', relation_label: 'OPERATES', confidence: 0.9 },
    ];

    const mockNodes = [
      { id: 'n1', name: 'Modal Cloud', label: 'Infrastructure', attributes: {} },
      { id: 'n2', name: 'GLiNER Engine', label: 'Model', attributes: {} },
      { id: 'n3', name: 'NER Service', label: 'Service', attributes: {} },
    ];

    const upsertedClusters: any[] = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'chronic_edges') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: mockEdges, error: null }),
          };
        }
        if (table === 'chronic_nodes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: mockNodes, error: null }),
          };
        }
        if (table === 'cognitive_clusters') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            like: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn((items: any[]) => {
              upsertedClusters.push(...items);
              return Promise.resolve({ data: items, error: null });
            }),
          };
        }
        return {};
      }),
    };

    const count = await runGraphCommunityClustering(mockSupabase as any, 'user-1234');
    expect(count).toBe(1);
    expect(upsertedClusters.length).toBe(1);
    expect(upsertedClusters[0].cluster_label).toBe('AI Infrastructure & Model Ops');
    expect(upsertedClusters[0].is_current).toBe(true);
    expect(upsertedClusters[0].characteristics).toEqual(['Modal Cloud', 'GLiNER Engine', 'NER Service']);
  });
});
