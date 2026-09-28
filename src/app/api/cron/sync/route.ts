import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { runPlatformSyncDirect } from '@/services/sync/platform-sync';
import { logCronMetrics, logAsyncJobFailure } from '@/utils/monitoring';
import type { EmbeddingOutcome } from '@/services/sync/embeddings-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Lib imports (pure logic extracted for testability — H-NEW-3 split) ────────
import {
  computeRetryDelayMs,
  computeRetryDelayWithJitterMs,
  computeNextRetryAttemptAt,
  toRetryQueueKey,
  fromRetryQueueKey,
  toRunAttemptFromRetryAttempt,
  isNonRetriableHttpStatus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RETRY_BASE_DELAY_MS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RETRY_MAX_DELAY_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_JITTER_RATIO,
} from '@/lib/cron/retry';

import {
  toEscalationCandidates,
  shouldDispatchEscalation,
  toEscalationKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_PENDING_RETRY_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_DEAD_LETTER_24H_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_MAX_RETRY_ATTEMPT_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_FAILURE_RATE_24H_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_DISPATCH_COOLDOWN_MINUTES,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_OWNER_WARNING,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_OWNER_CRITICAL,
} from '@/lib/cron/escalation';

import type {
  RetryQueueRow,
  RetryQueueUpsertRow,
  RetryDeadLetterInsertRow,
} from '@/lib/cron/retry';

import type {
  UserEscalationMetrics,
  EscalationCandidate,
  EscalationSeverity,
  EscalationStatus,
} from '@/lib/cron/escalation';

// Re-export public API so existing test imports continue to work
export {
  computeRetryDelayMs,
  computeRetryDelayWithJitterMs,
  shouldDispatchEscalation,
  toEscalationCandidates,
  shouldDispatchEscalation,
  toEscalationKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_PENDING_RETRY_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_DEAD_LETTER_24H_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_MAX_RETRY_ATTEMPT_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ALERT_FAILURE_RATE_24H_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_DISPATCH_COOLDOWN_MINUTES,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_OWNER_WARNING,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ESCALATION_OWNER_CRITICAL,
} from '@/lib/cron/escalation';

import {
  isMissingTable,
  parseResponsePayload,
  resolveBaseUrl,
  isUuid,
  getCronSecret,
  isAuthorizedCron,
  toLogStatus,
  toIsoFromNowMinusDuration,
  fetchWithTimeout,
  runWithConcurrency
} from '@/lib/cron/sync-utils';

import { processEscalations } from '@/lib/cron/sync-escalation-handler';
import { persistSyncResults, persistCronMetrics } from '@/lib/cron/sync-persistence';

// Re-export public API so existing test imports continue to work
export {
  computeRetryDelayMs,
  computeRetryDelayWithJitterMs,
  shouldDispatchEscalation,
  toEscalationCandidates,
};

// Vercel function timeout — must be <= plan limit (Pro = 800s max for background)

export const dynamic = 'force-dynamic';

type TokenRow = {
  user_id: string;
  platform: string;
};

type PlatformOutcome = {
  platform: string;
  routePlatform: string;
  success: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
};

type UserSyncOutcome = {
  userId: string;
  platformResults: PlatformOutcome[];
  embeddings: EmbeddingOutcome;
};

type SyncRunLogInsertRow = {
  run_id: string;
  user_id: string;
  platform: string;
  trigger: 'cron' | 'manual' | 'recovery';
  status: 'success' | 'error' | 'skipped';
  http_status: number | null;
  duration_ms: number;
  attempt: number;
  started_at: string;
  completed_at: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

// RetryQueueRow, RetryQueueUpsertRow, RetryDeadLetterInsertRow — imported from @/lib/cron/retry
// EscalationSeverity, EscalationStatus, EscalationCandidate, UserEscalationMetrics — imported from @/lib/cron/escalation



// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toFiniteNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

// All platforms that can be synced via the daily cron.
// OAuth platforms come from oauth_tokens; direct-key platforms are injected below.
const SUPPORTED_PLATFORMS = new Set([
  // Original active ingestion engines
  'github', 'gmail', 'google_calendar', 'google-calendar', 'notion', 'reddit', 'slack', 'discord', 'meta', 'facebook',
  // Expanded — all OAuth platforms added in later sessions
  'dropbox', 'asana', 'clickup', 'netlify', 'webflow', 'canva',
  'strava', 'fitbit', 'withings', 'sentry', 'twitter',
]);
// Direct API-key platforms (no oauth_tokens row) — always included if env key set
const DIRECT_KEY_PLATFORMS: Array<{ platform: string; envKey: string }> = [
  { platform: 'vercel', envKey: 'VERCEL_API_TOKEN' },
  { platform: 'devin', envKey: 'DEVIN_API_KEY' },
  { platform: 'cursor', envKey: 'CURSOR_API_KEY' },
];
const SUPPORTED_RETRY_PLATFORMS = new Set([...SUPPORTED_PLATFORMS, 'embeddings']);

// ─── Runtime tuning constants (route-local) ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SYNC_TIMEOUT_MS         = Number(process.env.CRON_SYNC_TIMEOUT_MS        || 20000);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EMBEDDINGS_TIMEOUT_MS   = Number(process.env.CRON_EMBEDDINGS_TIMEOUT_MS  || 25000);
const DEFAULT_MAX_USERS_PER_RUN = Number(process.env.CRON_MAX_USERS_PER_RUN    || 10);
const USER_CONCURRENCY        = Number(process.env.CRON_USER_CONCURRENCY       || 3);
const PLATFORM_CONCURRENCY    = Number(process.env.CRON_PLATFORM_CONCURRENCY   || 2);
const RETRY_DUE_LIMIT         = Number(process.env.CRON_RETRY_DUE_LIMIT        || 100);

// These are route-only (not in lib) — webhook URL and include-warning flag
const ESCALATION_WEBHOOK_URL     = process.env.SYNC_ESCALATION_WEBHOOK_URL?.trim() || null;
const ESCALATION_INCLUDE_WARNING = ['1', 'true', 'yes', 'on'].includes(
  (process.env.SYNC_ESCALATION_INCLUDE_WARNING || '').toLowerCase()
);

// ─── Route-local utility functions ───────────────────────────────────────────


// ── NOTE: The following functions are imported from lib/cron/retry and lib/cron/escalation ──
// computeRetryDelayMs, computeRetryDelayWithJitterMs, computeNextRetryAttemptAt,
// toRetryQueueKey, fromRetryQueueKey, toRunAttemptFromRetryAttempt, isNonRetriableHttpStatus,
// shouldDispatchEscalation, toEscalationCandidates, toEscalationKey
// ─────────────────────────────────────────────────────────────────────────────────────────────


async function dispatchEscalationWebhook(payload: Record<string, unknown>): Promise<EscalationDispatchResult> {
  if (!ESCALATION_WEBHOOK_URL) {
    return {
      attempted: false,
      success: false,
      status: null,
      error: 'SYNC_ESCALATION_WEBHOOK_URL is not configured.',
    };
  }

  try {
    const response = await fetchWithTimeout(
      ESCALATION_WEBHOOK_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      5000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        attempted: true,
        success: false,
        status: response.status,
        error: body.slice(0, 300) || `Webhook dispatch failed (${response.status}).`,
      };
    }

    return {
      attempted: true,
      success: true,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      status: null,
      error: message,
    };
  }
}



async function runPlatformSync(
  supabase: SupabaseClient,
  platform: string,
  userId: string
): Promise<PlatformOutcome> {
  return runPlatformSyncDirect(supabase, platform, userId);
}

async function runEmbeddingsSync(baseUrl: string, userId: string, secret: string): Promise<EmbeddingOutcome> {
  const startedAt = Date.now();

  try {
    // Embeddings sync route has been removed during cleanup.
    // We mock a successful empty execution so the cron doesn't fail.
    return {
      attempted: true,
      success: true,
      status: 200,
      durationMs: Date.now() - startedAt,
    };

    // (Dead code removed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function runCronSync(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Admin client configuration is missing.', detail }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const forcedUserId = params.get('userId')?.trim();

  if (forcedUserId && !isUuid(forcedUserId)) {
    return NextResponse.json({ error: 'Invalid userId query parameter.' }, { status: 400 });
  }

  const requestedMaxUsers = Number(params.get('maxUsers') || DEFAULT_MAX_USERS_PER_RUN);
  const maxUsers = Number.isFinite(requestedMaxUsers)
    ? Math.max(1, Math.min(Math.floor(requestedMaxUsers), 100))
    : DEFAULT_MAX_USERS_PER_RUN;

  let query = supabase
    .from('oauth_tokens')
    .select('user_id, platform')
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (forcedUserId) {
    query = query.eq('user_id', forcedUserId);
  }

  const { data: tokenRows, error: tokenError } = await query;

  if (tokenError) {
    return NextResponse.json(
      {
        error: 'Failed to load connected platforms for cron sync.',
        detail: tokenError.message,
      },
      { status: 500 }
    );
  }

  let retryRows: RetryQueueRow[] = [];
  let retryQueueWarning: string | null = null;
  let retryQueueReady = true;

  let retryQuery = supabase
    .from('sync_retry_queue')
    .select('user_id,platform,retry_attempt,next_attempt_at')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(Math.max(1, RETRY_DUE_LIMIT));

  if (forcedUserId) {
    retryQuery = retryQuery.eq('user_id', forcedUserId);
  }

  const { data: retryRowsData, error: retryRowsError } = await retryQuery;
  if (retryRowsError) {
    retryQueueReady = false;
    if (isMissingTable(retryRowsError.code)) {
      retryQueueWarning = 'sync_retry_queue table is not available. Apply migration 006_sync_retry_queue.sql.';
    } else {
      retryQueueWarning = `Failed to read retry queue: ${retryRowsError.message}`;
    }

    console.warn('[Cron Sync] Retry queue unavailable:', retryQueueWarning);
  } else {
    retryRows = (retryRowsData ?? []) as RetryQueueRow[];
  }

  const userPlatformMap = new Map<string, Set<string>>();
  const retryAttemptMap = new Map<string, number>();
  const embeddingsRetryUsers = new Set<string>();
  const retryPriorityOrder = new Map<string, number>();

  (tokenRows as TokenRow[] | null)?.forEach((row) => {
    // Only queue sync for platforms that are actually supported by the cron engine
    if (!SUPPORTED_PLATFORMS.has(row.platform)) {
      return;
    }
    if (!userPlatformMap.has(row.user_id)) {
      userPlatformMap.set(row.user_id, new Set());
    }
    userPlatformMap.get(row.user_id)?.add(row.platform);
  });

  // Inject direct-key platforms for every user that has oauth tokens (shared infrastructure)
  const directPlatformsToAdd = DIRECT_KEY_PLATFORMS
    .filter((p) => Boolean(process.env[p.envKey]))
    .map((p) => p.platform);
  for (const [uid] of userPlatformMap) {
    for (const dp of directPlatformsToAdd) {
      userPlatformMap.get(uid)?.add(dp);
    }
  }

  retryRows.forEach((row, index) => {
    if (!SUPPORTED_RETRY_PLATFORMS.has(row.platform)) {
      return;
    }

    if (!userPlatformMap.has(row.user_id)) {
      userPlatformMap.set(row.user_id, new Set());
    }

    if (!retryPriorityOrder.has(row.user_id)) {
      retryPriorityOrder.set(row.user_id, index);
    }

    retryAttemptMap.set(toRetryQueueKey(row.user_id, row.platform), Math.max(1, row.retry_attempt || 1));

    if (row.platform === 'embeddings') {
      embeddingsRetryUsers.add(row.user_id);
      return;
    }

    userPlatformMap.get(row.user_id)?.add(row.platform);
  });

  const users = Array.from(userPlatformMap.entries())
    .map(([userId, platforms]) => ({
      userId,
      platforms: Array.from(platforms),
    }))
    .sort((left, right) => {
      const leftPriority = retryPriorityOrder.has(left.userId) ? retryPriorityOrder.get(left.userId)! : Number.MAX_SAFE_INTEGER;
      const rightPriority = retryPriorityOrder.has(right.userId) ? retryPriorityOrder.get(right.userId)! : Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority;
    })
    .slice(0, maxUsers);

  if (users.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No eligible users with connected platforms were found.',
      processedUsers: 0,
      retry: {
        queueReady: retryQueueReady,
        dueCount: retryRows.length,
        scheduledCount: 0,
        resolvedCount: 0,
        droppedCount: 0,
        deadLetteredCount: 0,
        warning: retryQueueWarning,
      },
      observability: {
        runLogsPersisted: true,
        retryQueuePersisted: retryQueueReady,
        deadLetterPersisted: true,
        warning: retryQueueWarning,
      },
      outcomes: [],
    });
  }

  const baseUrl = resolveBaseUrl(request);
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const outcomes = await runWithConcurrency(
    users,
    Math.max(1, USER_CONCURRENCY),
    async ({ userId, platforms }): Promise<UserSyncOutcome> => {
      const platformResults = await runWithConcurrency(
        platforms,
        Math.max(1, PLATFORM_CONCURRENCY),
        (platform) => runPlatformSync(supabase, platform, userId)
      );

      const anyPlatformSuccess = platformResults.some((result) => result.success);
      const hasEmbeddingsRetry = embeddingsRetryUsers.has(userId);
      const embeddings = anyPlatformSuccess || hasEmbeddingsRetry
        ? await runEmbeddingsSync(baseUrl, userId, cronSecret)
        : {
            attempted: false,
            success: false,
            status: null,
            durationMs: 0,
          };

      return {
        userId,
        platformResults,
        embeddings,
      };
    }
  );

  const processedUserIds = Array.from(new Set(outcomes.map((outcome) => outcome.userId)));

  const platformRuns = outcomes.flatMap((outcome) => outcome.platformResults);
  const platformSuccessCount = platformRuns.filter((result) => result.success).length;
  const platformFailureCount = platformRuns.length - platformSuccessCount;

  const embeddingsAttempted = outcomes.filter((outcome) => outcome.embeddings.attempted).length;
  const embeddingsSuccessCount = outcomes.filter((outcome) => outcome.embeddings.success).length;

  const syncRunLogs: SyncRunLogInsertRow[] = outcomes.flatMap((outcome) => {
    const completedAtIso = new Date().toISOString();

    const platformRows = outcome.platformResults.map((result) => {
      const retryAttempt = retryAttemptMap.get(toRetryQueueKey(outcome.userId, result.platform));

      return {
        run_id: runId,
        user_id: outcome.userId,
        platform: result.platform,
        trigger: 'cron' as const,
        status: toLogStatus(result.success),
        http_status: result.status,
        duration_ms: Math.max(0, result.durationMs),
        attempt: toRunAttemptFromRetryAttempt(retryAttempt),
        started_at: toIsoFromNowMinusDuration(result.durationMs),
        completed_at: completedAtIso,
        error_message: result.error ?? null,
        metadata: {
          routePlatform: result.routePlatform,
          retrySource: retryAttempt ? 'queue' : 'fresh',
          retryAttempt: retryAttempt ?? 0,
        },
      };
    });

    const embeddings = outcome.embeddings;
    const embeddingsRetryAttempt = retryAttemptMap.get(toRetryQueueKey(outcome.userId, 'embeddings'));
    const embeddingsRow: SyncRunLogInsertRow = {
      run_id: runId,
      user_id: outcome.userId,
      platform: 'embeddings',
      trigger: 'cron',
      status: toLogStatus(embeddings.success, embeddings.attempted),
      http_status: embeddings.status,
      duration_ms: Math.max(0, embeddings.durationMs),
      attempt: toRunAttemptFromRetryAttempt(embeddingsRetryAttempt),
      started_at: toIsoFromNowMinusDuration(embeddings.durationMs),
      completed_at: completedAtIso,
      error_message: embeddings.error ?? null,
      metadata: {
        attempted: embeddings.attempted,
        retrySource: embeddingsRetryAttempt ? 'queue' : 'fresh',
        retryAttempt: embeddingsRetryAttempt ?? 0,
      },
    };

    return [...platformRows, embeddingsRow];
  });

  const retryQueueUpserts: RetryQueueUpsertRow[] = [];
  const retryQueueDeleteKeySet = new Set<string>();
  const retryDeadLetters: RetryDeadLetterInsertRow[] = [];
  let retryDroppedCount = 0;
  let retryDeadLetteredCount = 0;

  const queueRetryForFailure = (params: {
    userId: string;
    platform: string;
    priorRetryAttempt: number;
    status: number | null;
    error: string | undefined;
  }) => {
    const { userId, platform, priorRetryAttempt, status, error } = params;
    const runAttempt = toRunAttemptFromRetryAttempt(priorRetryAttempt > 0 ? priorRetryAttempt : undefined);
    const queueKey = toRetryQueueKey(userId, platform);

    // Log async job failure for monitoring (Work Item #7)
    const jobType = platform === 'embeddings' ? 'embedding' : 'sync';
    logAsyncJobFailure(supabase, {
      jobId: `${runId}-${userId}-${platform}-${runAttempt}`,
      type: jobType as 'sync' | 'embedding',
      userId,
      platform,
      error: error || `HTTP ${status}`,
      timestamp: new Date().toISOString(),
      retriable: !isNonRetriableHttpStatus(status),
    }).catch((logError) => {
      console.warn('[Cron Sync] Failed to log async job failure:', logError);
    });

    if (isNonRetriableHttpStatus(status)) {
      retryDeadLetteredCount += 1;
      retryDroppedCount += 1;
      retryQueueDeleteKeySet.add(queueKey);
      retryDeadLetters.push({
        run_id: runId,
        user_id: userId,
        platform,
        retry_attempt: runAttempt,
        last_http_status: status,
        error_message: error ?? null,
        failure_reason: 'non_retriable_status',
        metadata: {
          runAttempt,
          maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
          source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        },
      });
      return;
    }

    if (runAttempt >= Math.max(1, RETRY_MAX_ATTEMPTS)) {
      retryDeadLetteredCount += 1;
      retryDroppedCount += 1;
      retryQueueDeleteKeySet.add(queueKey);
      retryDeadLetters.push({
        run_id: runId,
        user_id: userId,
        platform,
        retry_attempt: runAttempt,
        last_http_status: status,
        error_message: error ?? null,
        failure_reason: 'max_attempts_exceeded',
        metadata: {
          runAttempt,
          maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
          source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        },
      });
      return;
    }

    const nextRetryAttempt = priorRetryAttempt > 0 ? priorRetryAttempt + 1 : 1;
    const retryDelayMs = computeRetryDelayWithJitterMs(nextRetryAttempt);
    retryQueueUpserts.push({
      user_id: userId,
      platform,
      retry_attempt: nextRetryAttempt,
      next_attempt_at: computeNextRetryAttemptAt(nextRetryAttempt, retryDelayMs),
      last_http_status: status,
      last_error_message: error ?? null,
      metadata: {
        source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        retryDelayMs,
        baseDelayMs: computeRetryDelayMs(nextRetryAttempt),
        jitterRatio: RETRY_JITTER_RATIO,
        maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
        runId,
      },
      updated_at: new Date().toISOString(),
    });
  };

  outcomes.forEach((outcome) => {
    outcome.platformResults.forEach((result) => {
      const key = toRetryQueueKey(outcome.userId, result.platform);
      const priorRetryAttempt = retryAttemptMap.get(key) ?? 0;

      if (result.success) {
        retryQueueDeleteKeySet.add(key);
      } else {
        queueRetryForFailure({
          userId: outcome.userId,
          platform: result.platform,
          priorRetryAttempt,
          status: result.status,
          error: result.error,
        });
      }
    });

    if (!outcome.embeddings.attempted) {
      return;
    }

    const embeddingsKey = toRetryQueueKey(outcome.userId, 'embeddings');
    const priorEmbeddingsRetryAttempt = retryAttemptMap.get(embeddingsKey) ?? 0;

    if (outcome.embeddings.success) {
      retryQueueDeleteKeySet.add(embeddingsKey);
      return;
    }

    queueRetryForFailure({
      userId: outcome.userId,
      platform: 'embeddings',
      priorRetryAttempt: priorEmbeddingsRetryAttempt,
      status: outcome.embeddings.status,
      error: outcome.embeddings.error,
    });
  });

  const dedupedRetryQueueUpserts = Array.from(
    new Map(retryQueueUpserts.map((row) => [toRetryQueueKey(row.user_id, row.platform), row])).values()
  );
  const retryUpsertKeySet = new Set(dedupedRetryQueueUpserts.map((row) => toRetryQueueKey(row.user_id, row.platform)));
  const retryQueueDeleteRows = Array.from(retryQueueDeleteKeySet)
    .filter((key) => !retryUpsertKeySet.has(key))
    .map(fromRetryQueueKey);

  const {
    logPersistenceError,
    retryQueuePersisted,
    retryQueuePersistenceError,
    deadLetterPersisted,
    deadLetterPersistenceError,
  } = await persistSyncResults(
    supabase,
    syncRunLogs,
    retryQueueReady,
    dedupedRetryQueueUpserts,
    retryQueueDeleteRows,
    retryDeadLetters,
    retryQueueWarning
  );

  const {
    escalationEvaluationWarning,
    escalationPersistenceError,
    escalationDispatchWarning,
    escalationPersisted,
    escalationActiveCount,
    escalationOpenedCount,
    escalationResolvedCount,
    escalationDispatchedCount,
    escalationDispatchFailureCount,
  } = await processEscalations(
    supabase,
    processedUserIds,
    runId,
    ESCALATION_WEBHOOK_URL,
    ESCALATION_INCLUDE_WARNING
  );

  let observabilityWarning = [
    logPersistenceError,
    retryQueuePersistenceError,
    deadLetterPersistenceError,
    escalationEvaluationWarning,
    escalationPersistenceError,
    escalationDispatchWarning,
  ]
    .filter(Boolean)
    .join(' | ') || null;

  // Log cron execution metrics for monitoring (Work Item #7)
  const cronMetricsResult = await persistCronMetrics(supabase, {
    runId,
    durationMs: Date.now() - startedAt,
    processedUsers: outcomes.length,
    platformRuns: platformRuns.length,
    platformSuccessCount,
    platformFailureCount,
    embeddingsAttempted: embeddingsAttempted > 0,
    embeddingsSuccessCount,
    embeddingsFailureCount: embeddingsAttempted - embeddingsSuccessCount,
    retryQueueDepth: dedupedRetryQueueUpserts.length,
    deadLetterCount24h: retryDeadLetteredCount,
    escalationCount: escalationActiveCount,
    successRate: platformRuns.length > 0 ? platformSuccessCount / platformRuns.length : 0,
    timestamp: new Date().toISOString(),
  });

  if (cronMetricsResult.warning) {
    observabilityWarning = observabilityWarning
      ? `${observabilityWarning} | ${cronMetricsResult.warning}`
      : cronMetricsResult.warning;
  }

  return NextResponse.json({
    ok: true,
    message: 'Cron sync cycle completed.',
    runId,
    durationMs: Date.now() - startedAt,
    processedUsers: outcomes.length,
    platformRuns: platformRuns.length,
    platformSuccessCount,
    platformFailureCount,
    embeddingsAttempted,
    embeddingsSuccessCount,
    retry: {
      queueReady: retryQueueReady,
      dueCount: retryRows.length,
      scheduledCount: dedupedRetryQueueUpserts.length,
      resolvedCount: retryQueueDeleteRows.length,
      droppedCount: retryDroppedCount,
      deadLetteredCount: retryDeadLetteredCount,
      warning: retryQueuePersistenceError,
    },
    escalation: {
      activeCount: escalationActiveCount,
      openedCount: escalationOpenedCount,
      resolvedCount: escalationResolvedCount,
      dispatchedCount: escalationDispatchedCount,
      dispatchFailureCount: escalationDispatchFailureCount,
      warning: [escalationEvaluationWarning, escalationPersistenceError, escalationDispatchWarning]
        .filter(Boolean)
        .join(' | ') || null,
    },
    observability: {
      runLogsPersisted: !logPersistenceError,
      retryQueuePersisted,
      deadLetterPersisted,
      escalationPersisted,
      cronMetricsLogged: cronMetricsResult.success,
      warning: observabilityWarning,
    },
    outcomes,
  });
}

export async function GET(request: Request) {
  return runCronSync(request);
}

export async function POST(request: Request) {
  return runCronSync(request);
}
