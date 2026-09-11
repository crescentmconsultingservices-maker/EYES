import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/cron/embeddings/route';

// Mock AI service batch embeddings
const mockGenerateEmbeddingsBatch = vi.fn();
vi.mock('@/services/ai/ai', () => ({
  generateEmbeddingsBatch: (...args: unknown[]) => mockGenerateEmbeddingsBatch(...args),
}));

// Mock Supabase admin client
const mockSelect = vi.fn();
const mockIs = vi.fn();
const mockNot = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockEqId = vi.fn();
const mockEqUser = vi.fn();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'memories') {
        return {
          select: mockSelect.mockReturnValue({
            is: mockIs.mockReturnValue({
              not: mockNot.mockReturnValue({
                order: mockOrder.mockReturnValue({
                  limit: mockLimit,
                }),
              }),
            }),
          }),
          update: mockUpdate.mockReturnValue({
            eq: mockEqId.mockReturnValue({
              eq: mockEqUser.mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

// Mock QStash
const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: 'msg_q_123' });
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = mockPublishJSON;
  },
}));

describe('POST /api/cron/embeddings', () => {
  const TEST_SECRET = 'unit-test-cron-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
    delete process.env.QSTASH_TOKEN;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('rejects unauthorized requests', async () => {
    const req = new Request('http://localhost/api/cron/embeddings', {
      method: 'POST',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns gracefully when no memories are pending embedding', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const req = new Request('http://localhost/api/cron/embeddings', {
      method: 'POST',
      headers: {
        'x-cron-secret': TEST_SECRET,
      },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBe(0);
    expect(json.hasMore).toBe(false);
  });

  it('batch embeds memories and updates them concurrently', async () => {
    const testMemories = [
      { id: 'mem-1', user_id: 'user-1', platform: 'gmail', title: 'Invoice', content: 'Invoice paid' },
      { id: 'mem-2', user_id: 'user-1', platform: 'slack', title: 'Meeting', content: 'Sync at 2pm' },
    ];

    mockLimit.mockResolvedValue({ data: testMemories, error: null });
    mockGenerateEmbeddingsBatch.mockResolvedValue([
      Array(1024).fill(0.1),
      Array(1024).fill(0.2),
    ]);

    const req = new Request('http://localhost/api/cron/embeddings', {
      method: 'POST',
      headers: {
        'x-cron-secret': TEST_SECRET,
      },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBe(2);
    expect(json.failed).toBe(0);
    expect(mockGenerateEmbeddingsBatch).toHaveBeenCalledWith([
      'Invoice\nInvoice paid',
      'Meeting\nSync at 2pm',
    ]);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('triggers QStash chaining when batch size indicates more pending items', async () => {
    process.env.QSTASH_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://eyes.test';
    process.env.EMBEDDING_QUEUE_BATCH_SIZE = '2';

    const testMemories = [
      { id: 'mem-1', user_id: 'user-1', platform: 'gmail', title: 'A', content: 'A' },
      { id: 'mem-2', user_id: 'user-1', platform: 'gmail', title: 'B', content: 'B' },
    ];

    mockLimit.mockResolvedValue({ data: testMemories, error: null });
    mockGenerateEmbeddingsBatch.mockResolvedValue([
      Array(1024).fill(0.1),
      Array(1024).fill(0.2),
    ]);

    const req = new Request('http://localhost/api/cron/embeddings', {
      method: 'POST',
      headers: {
        'x-cron-secret': TEST_SECRET,
      },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hasMore).toBe(true);
    expect(mockPublishJSON).toHaveBeenCalledWith({
      url: 'https://eyes.test/api/cron/embeddings',
      headers: {
        'x-cron-secret': TEST_SECRET,
      },
      body: {},
      delay: 2,
    });
  });
});
