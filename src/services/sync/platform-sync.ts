/**
 * Direct platform sync service - used by cron to avoid HTTP overhead
 * Extracted from src/app/api/cron/sync/route.ts for Priority 2 optimization
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type PlatformOutcome = {
  platform: string;
  routePlatform: string;
  success: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
};

const SYNC_TIMEOUT_MS = Number(process.env.CRON_SYNC_TIMEOUT_MS || 20000);
const COGNITIVE_EXTRACT_SECRET = process.env.CRON_SECRET || '';

function toSyncRoutePlatform(platform: string) {
  if (platform === 'google_calendar') return 'google-calendar';
  return platform.replace(/_/g, '-');
}

/**
 * Fire-and-forget: trigger cognitive extraction for a user after sync.
 * Called after successful platform syncs to keep the Chronic Layer up to date.
 * Never awaited — does not block sync completion.
 */
export function triggerCognitiveExtraction(baseUrl: string, userId: string): void {
  const url = `${baseUrl}/api/cognitive/extract`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': COGNITIVE_EXTRACT_SECRET,
    },
    body: JSON.stringify({ userId, batch: true }),
    signal: AbortSignal.timeout(25_000),
  }).catch(err => {
    // Non-critical — log and continue
    console.warn(`[PlatformSync] Cognitive extraction trigger failed for ${userId}:`, err instanceof Error ? err.message : err);
  });
}

function parseResponsePayload(rawBody: string) {
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody.slice(0, 300) };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Run platform sync via HTTP (used when called from route handlers)
 * Called from sync/all/route.ts browser requests
 */
export async function runPlatformSyncViaHttp(
  baseUrl: string,
  platform: string,
  userId: string,
  secret: string
): Promise<PlatformOutcome> {
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/sync/${routePlatform}`,
      {
        method: 'POST',
        headers: {
          'x-cron-secret': secret,
          'x-cron-user-id': userId,
        },
      },
      SYNC_TIMEOUT_MS
    );

    const rawBody = await response.text();
    const body = parseResponsePayload(rawBody);

    if (!response.ok) {
      return {
        platform,
        routePlatform,
        success: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Sync failed (${response.status})`,
      };
    }

    return {
      platform,
      routePlatform,
      success: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform,
      routePlatform,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

/**
 * Run platform sync directly (used by cron to avoid HTTP overhead)
 * Priority 2 optimization: Direct call instead of HTTP fetch
 *
 * This function dynamically imports the corresponding route module and executes
 * the POST handler in-process, bypassing the network interface.
 */
export async function runPlatformSyncDirect(
  supabase: SupabaseClient,
  platform: string,
  userId: string
): Promise<PlatformOutcome> {
  void supabase;
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  try {
    // --- Dynamic Provider Registry (New Architecture) ---
    const { syncProviders } = await import('@/services/sync/provider-registry');
    
    // Check if the platform has been migrated to the new registry
    if (syncProviders[platform] || syncProviders[routePlatform]) {
      const providerKey = syncProviders[routePlatform] ? routePlatform : platform;
      const provider = syncProviders[providerKey];
      
      const { createAdminClient } = await import('@/utils/supabase/server');
      const adminClient = await createAdminClient();
      
      const result = await provider.executeSync({
        supabase: adminClient,
        userId: userId,
        mode: 'cron'
      }, 'delta');
      
      if (result.status !== 200) throw new Error(result.error);
      
      return {
        platform,
        routePlatform,
        success: true,
        status: 200,
        durationMs: Date.now() - startedAt,
      };
    }

    // Fallback for newer platforms or platforms without direct imports
    const secret = process.env.CRON_SECRET || '';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return await runPlatformSyncViaHttp(baseUrl, platform, userId, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform,
      routePlatform,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}
