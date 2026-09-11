import { describe, expect, it, vi, beforeEach } from 'vitest';
import { dispatchNextSyncJob } from '@/services/sync/queue-dispatcher';
import { handler } from '@/app/api/queue/sync/route';

// Mock QStash Client
const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: 'msg_test_123' });
vi.mock('@upstash/qstash', () => {
  return {
    Client: class {
      publishJSON = mockPublishJSON;
    },
  };
});

// Mock Supabase admin client
const mockGetUserById = vi.fn();
vi.mock('@/utils/supabase/server', () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
      },
    },
  }),
}));

// Mock sync providers
const mockExecuteSync = vi.fn().mockResolvedValue({
  status: 200,
  data: { ok: true, syncedMessages: 50, hasMore: false },
});

vi.mock('@/services/sync/provider-registry', () => ({
  syncProviders: {
    gmail: { executeSync: (...args: unknown[]) => mockExecuteSync(...args) },
    github: { executeSync: (...args: unknown[]) => mockExecuteSync(...args) },
    discord: { executeSync: (...args: unknown[]) => mockExecuteSync(...args) },
    meta: { executeSync: (...args: unknown[]) => mockExecuteSync(...args) },
  },
}));

describe('QStash Sync Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.QSTASH_TOKEN;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('returns gracefully when QSTASH_TOKEN is not configured', async () => {
    const res = await dispatchNextSyncJob({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'gmail',
      mode: 'backfill',
    });

    expect(res.enqueued).toBe(false);
    expect(res.reason).toContain('QSTASH_TOKEN');
  });

  it('publishes JSON to QStash with the expected endpoint and delay', async () => {
    process.env.QSTASH_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://eyes-app.test';

    const res = await dispatchNextSyncJob({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'gmail',
      mode: 'backfill',
      cursor: 'token_abc',
      delaySeconds: 5,
    });

    expect(res.enqueued).toBe(true);
    expect(res.messageId).toBe('msg_test_123');
    expect(mockPublishJSON).toHaveBeenCalledWith({
      url: 'https://eyes-app.test/api/queue/sync',
      body: {
        userId: '11111111-1111-4111-8111-111111111111',
        platform: 'gmail',
        mode: 'backfill',
        cursor: 'token_abc',
      },
      delay: 5,
    });
  });
});

describe('POST /api/queue/sync handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when missing required parameters', async () => {
    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Missing userId or platform');
  });

  it('returns 400 when userId is not a valid UUID', async () => {
    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'not-a-uuid', platform: 'gmail' }),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid userId format');
  });

  it('returns 400 when platform is unsupported', async () => {
    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '11111111-1111-4111-8111-111111111111',
        platform: 'unsupported_platform',
      }),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Unsupported platform');
  });

  it('returns 404 when user is not found in database', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'User not found' },
    });

    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '11111111-1111-4111-8111-111111111111',
        platform: 'gmail',
      }),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('User not found');
  });

  it('executes sync provider and returns success payload', async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'test@example.com',
          user_metadata: { name: 'Test User' },
        },
      },
      error: null,
    });

    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '11111111-1111-4111-8111-111111111111',
        platform: 'gmail',
        mode: 'backfill',
      }),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.platform).toBe('gmail');
    expect(json.data.syncedMessages).toBe(50);
    expect(mockExecuteSync).toHaveBeenCalled();
  });

  it.each(['github', 'discord', 'meta'])('executes %s background sync via provider registry', async (platform) => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'test@example.com',
          user_metadata: { name: 'Test User' },
        },
      },
      error: null,
    });

    const req = new Request('http://localhost/api/queue/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '11111111-1111-4111-8111-111111111111',
        platform,
        mode: 'backfill',
      }),
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.platform).toBe(platform);
    expect(mockExecuteSync).toHaveBeenCalled();
  });
});
