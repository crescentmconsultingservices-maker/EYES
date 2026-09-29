import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const invokeModelMock = vi.fn();

  return {
    createClientMock,
    invokeModelMock,
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: hoisted.createClientMock,
}));

vi.mock('@/services/ai/ai', () => ({
  invokeModel: hoisted.invokeModelMock,
}));

import { POST as enrichPost } from '@/app/api/actions/[id]/enrich/route';

describe('POST /api/actions/[id]/enrich', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached action instantly if already enriched', async () => {
    const mockAction = {
      id: 'action-123',
      user_id: 'user-1',
      title: 'Reply to client',
      description: 'Discussing scope',
      suggested_action: 'Draft: Hi, here is our proposal.',
      action_type: 'EMAIL_REPLY',
      enriched_at: '2026-09-29T10:00:00.000Z',
    };

    hoisted.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'action_queue') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockAction, error: null }),
          };
        }
        return {};
      }),
    });

    const res = await enrichPost(
      new Request('http://localhost/api/actions/action-123/enrich', { method: 'POST' }),
      { params: Promise.resolve({ id: 'action-123' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBe(true);
    expect(body.action.suggested_action).toBe('Draft: Hi, here is our proposal.');
    expect(hoisted.invokeModelMock).not.toHaveBeenCalled();
  });

  it('generates draft and citation on demand and caches to DB when not yet enriched', async () => {
    const mockAction = {
      id: 'action-456',
      user_id: 'user-1',
      title: 'Reply to Sarah',
      description: 'Asking for project updates',
      suggested_action: null,
      action_type: 'EMAIL_REPLY',
      enriched_at: null,
    };

    const updateMock = vi.fn().mockReturnThis();

    hoisted.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'action_queue') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockAction, error: null }),
            update: updateMock,
          };
        }
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'user@example.com' }, error: null }),
          };
        }
        if (table === 'memories') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ content: 'Sample sent message' }], error: null }),
          };
        }
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    hoisted.invokeModelMock.mockImplementation(async (opts: { capability: string }) => {
      if (opts.capability === 'chat') {
        return 'Hi Sarah, the project update is on track for Friday.';
      }
      if (opts.capability === 'embed') {
        return { embedding: [0.1, 0.2] };
      }
      return null;
    });

    const res = await enrichPost(
      new Request('http://localhost/api/actions/action-456/enrich', { method: 'POST' }),
      { params: Promise.resolve({ id: 'action-456' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBe(false);
    expect(body.action.suggested_action).toBe('Hi Sarah, the project update is on track for Friday.');
    expect(updateMock).toHaveBeenCalled();
  });
});
