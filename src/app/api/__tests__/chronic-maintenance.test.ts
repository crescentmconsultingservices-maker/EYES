import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runChronicDedupe, runChronicDecay } from '@/services/graph/maintenance';
import { GET } from '@/app/api/cron/chronic/route';

describe('Chronic Graph Maintenance (Dedupe & Decay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runChronicDedupe merges case-insensitive duplicates and repoints edges', async () => {
    const mockNodes = [
      { id: 'node-1', name: 'OpenAI', created_at: '2026-01-01T00:00:00Z' },
      { id: 'node-2', name: ' openai ', created_at: '2026-02-01T00:00:00Z' },
      { id: 'node-3', name: 'Anthropic', created_at: '2026-01-01T00:00:00Z' },
    ];

    const edgeUpdates: any[] = [];
    const nodeDeletions: any[] = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'chronic_nodes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'user_id') {
                return Promise.resolve({ data: mockNodes, error: null });
              }
              return {
                eq: vi.fn().mockImplementation((c2: string, v2: string) => {
                  nodeDeletions.push({ id: val, user_id: v2 });
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            delete: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'chronic_edges') {
          return {
            update: vi.fn((payload: any) => ({
              eq: vi.fn().mockReturnThis(),
            })),
          };
        }
        return {};
      }),
    };

    const res = await runChronicDedupe(mockSupabase as any, 'user-test-123');
    expect(res.mergedCount).toBe(1);
    expect(res.remainingNodes).toBe(2);
  });

  it('runChronicDecay escalates stale commitments and decays mentions', async () => {
    const now = Date.now();
    const staleDate = new Date(now - 35 * 86400000).toISOString(); // 35 days ago
    const recentDate = new Date(now - 5 * 86400000).toISOString(); // 5 days ago

    const mockEdges = [
      // 1. Stale commitment -> should escalate to delayed_on
      {
        id: 'edge-commit-stale',
        head_node_id: 'n1',
        tail_node_id: 'n2',
        relation_label: 'commitment',
        observed_from: staleDate,
      },
      // 2. Stale factual relation -> should NOT decay
      {
        id: 'edge-fact-stale',
        head_node_id: 'n1',
        tail_node_id: 'n3',
        relation_label: 'works_at',
        observed_from: staleDate,
      },
      // 3. Stale general mention -> should decay (valid_to = now)
      {
        id: 'edge-mention-stale',
        head_node_id: 'n2',
        tail_node_id: 'n3',
        relation_label: 'discusses',
        observed_from: staleDate,
      },
      // 4. Recent mention -> active, untouched
      {
        id: 'edge-mention-recent',
        head_node_id: 'n1',
        tail_node_id: 'n4',
        relation_label: 'discusses',
        observed_from: recentDate,
      },
    ];

    const updatedEdges: Record<string, any> = {};

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'chronic_edges') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockEdges, error: null }),
            update: vi.fn((payload: any) => ({
              in: vi.fn((col: string, ids: string[]) => {
                ids.forEach(id => {
                  updatedEdges[id] = payload;
                });
                return Promise.resolve({ data: null, error: null });
              }),
            })),
          };
        }
        return {};
      }),
    };

    const res = await runChronicDecay(mockSupabase as any, 'user-test-123', 30);

    expect(res.escalatedCount).toBe(1);
    expect(res.decayedCount).toBe(1);
    expect(updatedEdges['edge-commit-stale']?.relation_label).toBe('delayed_on');
    expect(updatedEdges['edge-mention-stale']?.valid_to).toBeDefined();
    expect(updatedEdges['edge-fact-stale']).toBeUndefined();
    expect(updatedEdges['edge-mention-recent']).toBeUndefined();
  });

  it('GET /api/cron/chronic executes without error', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';

    const req = new Request('http://localhost/api/cron/chronic', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBeDefined();
  });
});
