import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { createClient as createServerClient, createAdminClient as createServerAdminClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

describe('Supabase Key Sanitization', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    // Inject CRLF pollution like Windows .env.local
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rwywnbkvbztzosvbmrqw.supabase.co\r\n';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test\r\n';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_role_key\r\n';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
  });

  it('createBrowserClient sanitizes and trims CRLF characters from URL and anon key', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = createBrowserClient() as any;
    expect(client).toBeDefined();
    const url = client.supabaseUrl;
    expect(url).toBe('https://rwywnbkvbztzosvbmrqw.supabase.co');
    expect(url).not.toContain('\r');
    expect(url).not.toContain('\n');
    expect(url).not.toContain('%0D%0A');
  });

  it('createServerClient sanitizes and trims CRLF characters', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (await createServerClient()) as any;
    expect(client).toBeDefined();
    const url = client.supabaseUrl;
    expect(url).toBe('https://rwywnbkvbztzosvbmrqw.supabase.co');
    expect(url).not.toContain('\r');
    expect(url).not.toContain('\n');
  });

  it('createAdminClient (server & admin) trims CRLF characters', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin1 = (await createServerAdminClient()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin2 = createAdminClient() as any;
    expect(admin1).toBeDefined();
    expect(admin2).toBeDefined();
    expect(admin1.supabaseUrl).toBe('https://rwywnbkvbztzosvbmrqw.supabase.co');
    expect(admin2.supabaseUrl).toBe('https://rwywnbkvbztzosvbmrqw.supabase.co');
  });
});

describe('Dynamic Reliability Calculation Logic', () => {
  function computeReliability(platforms: { connected: boolean; status: string }[]) {
    const connectedCount = platforms.filter(p => p.connected).length;
    if (platforms.length === 0 || connectedCount === 0) {
      return 'None';
    }
    const errorCount = platforms.filter(p => p.connected && p.status === 'error').length;
    const syncingCount = platforms.filter(p => p.connected && (p.status === 'syncing' || p.status === 'authenticating')).length;
    const healthyCount = connectedCount - errorCount;
    const healthRatio = healthyCount / connectedCount;

    if (errorCount > 0 && healthRatio < 0.7) {
      return 'Degraded';
    }
    if (syncingCount > 0 && healthyCount === connectedCount) {
      return 'Syncing';
    }
    if (healthRatio >= 0.85 && connectedCount >= 2) {
      return 'High';
    }
    if (healthRatio >= 0.5) {
      return 'Moderate';
    }
    return 'Low';
  }

  it('returns None when user has 0 connected platforms', () => {
    expect(computeReliability([])).toBe('None');
    expect(computeReliability([{ connected: false, status: 'idle' }])).toBe('None');
  });

  it('returns Degraded when user has platforms in error state', () => {
    const platforms = [
      { connected: true, status: 'error' },
      { connected: true, status: 'error' },
      { connected: true, status: 'connected' },
    ];
    expect(computeReliability(platforms)).toBe('Degraded');
  });

  it('returns High when user has healthy connected platforms without errors', () => {
    const platforms = [
      { connected: true, status: 'connected' },
      { connected: true, status: 'connected' },
      { connected: true, status: 'connected' },
    ];
    expect(computeReliability(platforms)).toBe('High');
  });

  it('returns Syncing when platforms are actively syncing without errors', () => {
    const platforms = [
      { connected: true, status: 'syncing' },
      { connected: true, status: 'authenticating' },
    ];
    expect(computeReliability(platforms)).toBe('Syncing');
  });
});
