import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeGithubSync } from '@/services/sync/github-service';
import { executeDiscordSync } from '@/services/sync/discord-service';
import { executeMetaSync } from '@/services/sync/meta-service';
import { executeNotionSync } from '@/services/sync/notion-service';
import { executeGoogleCalendarSync } from '@/services/sync/google-calendar-service';
import { executeRedditSync } from '@/services/sync/reddit-service';

// Mock queue-dispatcher
const mockDispatchNextSyncJob = vi.fn().mockResolvedValue({ enqueued: true, messageId: 'msg_123' });
vi.mock('@/services/sync/queue-dispatcher', () => ({
  dispatchNextSyncJob: (...args: unknown[]) => mockDispatchNextSyncJob(...args),
}));

// Mock oauth helpers
vi.mock('@/services/auth/oauth', () => ({
  getValidGithubToken: vi.fn().mockResolvedValue('gh_token_123'),
  getValidDiscordToken: vi.fn().mockResolvedValue('discord_token_123'),
  getValidGoogleToken: vi.fn().mockResolvedValue('google_token_123'),
  getValidRedditToken: vi.fn().mockResolvedValue('reddit_token_123'),
}));

vi.mock('@/services/auth/tokens', () => ({
  decryptToken: vi.fn().mockReturnValue('notion_token_123'),
}));

// Mock risk scorer
vi.mock('@/utils/risk/scorer', () => ({
  scoreGithubEvent: vi.fn().mockResolvedValue({ score: 10, severity: 'LOW', flagged: false, reasons: [] }),
  scoreDiscordEvent: vi.fn().mockResolvedValue({ score: 10, severity: 'LOW', flagged: false, reasons: [] }),
  scoreNotionEvent: vi.fn().mockResolvedValue({ score: 10, severity: 'LOW', flagged: false, reasons: [] }),
  scoreRedditEvent: vi.fn().mockResolvedValue({ score: 10, severity: 'LOW', flagged: false, reasons: [] }),
}));

// Mock privacy filter
vi.mock('@/utils/privacy/filter', () => ({
  getPrivacyExclusions: vi.fn().mockResolvedValue(new Set()),
}));

// Mock upsert helpers
vi.mock('@/utils/supabase/upsert', () => ({
  upsertRawEventsSafely: vi.fn().mockResolvedValue({ error: null }),
  upsertSyncStatusSafely: vi.fn().mockResolvedValue({ error: null }),
}));

describe('Connectors Backfill Auto-Chaining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executeGithubSync chains next page via QStash when hasMore is true during backfill', async () => {
    const fakeRepos = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      full_name: `user/repo-${i + 1}`,
      name: `repo-${i + 1}`,
      html_url: `https://github.com/user/repo-${i + 1}`,
      description: 'A test repo',
      language: 'TypeScript',
      stargazers_count: 5,
      forks_count: 1,
      pushed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fakeRepos,
    } as Response);

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    };

    const res = await executeGithubSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      userEmail: 'user@example.com',
      userName: 'User',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'github',
      mode: 'backfill',
      cursor: '2',
    }));
  });

  it('executeDiscordSync chains next batch via QStash when hasMoreOverall is true during backfill', async () => {
    const mockUser = { id: 'd_user_1', username: 'discord_user' };
    const mockGuilds = [{ id: 'g_1', name: 'Guild 1' }];
    const mockChannels = [{ id: 'c_1', name: 'general', type: 0 }];
    const mockMessages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg_${i + 1}`,
      content: `Message ${i + 1}`,
      timestamp: new Date().toISOString(),
      author: { bot: false, username: 'discord_user' },
    }));

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockUser } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockGuilds } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockChannels } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMessages } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    };

    const res = await executeDiscordSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'discord',
      mode: 'backfill',
    }));
  });

  it('executeMetaSync chains next batch via QStash when hasMore is true during backfill', async () => {
    const fakeMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `wa_${i + 1}`,
      from: 'Contact',
      message: `Hello ${i + 1}`,
      created_time: new Date().toISOString(),
    }));

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: fakeMessages,
          paging: { cursors: { after: 'cursor_wa_next_123' } },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], paging: {} }),
      } as Response);

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'oauth_tokens' ? { access_token: 'meta_token_123' } : null,
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const res = await executeMetaSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      userEmail: 'user@example.com',
      userName: 'Meta User',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'meta',
      mode: 'backfill',
      cursor: 'cursor_wa_next_123',
    }));
  });

  it('executeNotionSync chains next batch via QStash when hasMore is true during backfill', async () => {
    const fakePages = [
      {
        id: 'page_1',
        object: 'page',
        url: 'https://notion.so/page_1',
        last_edited_time: new Date().toISOString(),
        properties: {
          title: { title: [{ plain_text: 'Test Page' }] },
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch')
      // Search results
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: fakePages,
          has_more: true,
          next_cursor: 'notion_cursor_abc',
        }),
      } as Response)
      // Page block children
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'oauth_tokens' ? { access_token: 'enc:token' } : null,
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
      })),
    };

    const res = await executeNotionSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'notion',
      mode: 'backfill',
      cursor: 'notion_cursor_abc',
    }));
  });

  it('executeGoogleCalendarSync chains next batch via QStash when hasMore is true during backfill', async () => {
    const fakeEvents = [
      {
        id: 'cal_event_1',
        summary: 'Planning Session',
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date().toISOString() },
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: fakeEvents,
        nextPageToken: 'cal_page_token_xyz',
      }),
    } as Response);

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    };

    const res = await executeGoogleCalendarSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'google_calendar',
      mode: 'backfill',
      cursor: 'cal_page_token_xyz',
    }));
  });

  it('executeRedditSync chains next batch via QStash when hasMore is true during backfill', async () => {
    const fakeComments = [
      {
        data: {
          id: 'comment_1',
          name: 't1_comment_1',
          body: 'Interesting perspective on architecture.',
          subreddit: 'programming',
          created_utc: Math.floor(Date.now() / 1000),
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch')
      // Reddit me
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'reddit_user' }),
      } as Response)
      // Comments listing with after token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            children: fakeComments,
            after: 't1_after_token_999',
          },
        }),
      } as Response);

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    };

    const res = await executeRedditSync({
      supabase: mockSupabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'cron',
    }, 'backfill');

    expect(res.status).toBe(200);
    expect(res.data?.hasMore).toBe(true);
    expect(mockDispatchNextSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: '11111111-1111-4111-8111-111111111111',
      platform: 'reddit',
      mode: 'backfill',
      cursor: 't1_after_token_999',
    }));
  });
});
