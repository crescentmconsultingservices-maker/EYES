import { SupabaseClient } from '@supabase/supabase-js';
import {
  UserEscalationMetrics,
  EscalationCandidate,
  toEscalationCandidates,
  toEscalationKey,
  shouldDispatchEscalation,
  EscalationSeverity,
  EscalationStatus,
} from './escalation';
import { isMissingTable, fetchWithTimeout } from './sync-utils';

type EscalationEventRow = {
  user_id: string;
  code: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  owner: string;
  first_triggered_at: string;
  last_triggered_at: string;
  resolved_at: string | null;
  trigger_count: number;
  last_observed: number;
  threshold: number;
  message: string;
  last_dispatched_at: string | null;
  dispatch_count: number;
  metadata: Record<string, unknown>;
};

type RetryQueueMetricRow = {
  user_id: string;
  retry_attempt: number;
};

type RetryDeadLetterMetricRow = {
  user_id: string;
};

type RunLogMetricRow = {
  user_id: string;
  run_id: string;
  status: 'success' | 'error' | 'skipped';
};

type DispatchCandidate = {
  userId: string;
  code: string;
  severity: EscalationSeverity;
  owner: string;
  message: string;
  observed: number;
  threshold: number;
  metrics: EscalationCandidate['metrics'];
  nextDispatchCount: number;
};

type EscalationDispatchResult = {
  attempted: boolean;
  success: boolean;
  status: number | null;
  error?: string;
};

export async function dispatchEscalationWebhook(
  payload: Record<string, unknown>,
  webhookUrl: string | null
): Promise<EscalationDispatchResult> {
  if (!webhookUrl) {
    return {
      attempted: false,
      success: false,
      status: null,
      error: 'SYNC_ESCALATION_WEBHOOK_URL is not configured.',
    };
  }

  try {
    const response = await fetchWithTimeout(
      webhookUrl,
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

export async function processEscalations(
  supabase: SupabaseClient,
  processedUserIds: string[],
  runId: string,
  webhookUrl: string | null,
  includeWarning: boolean
) {
  let escalationEvaluationWarning: string | null = null;
  let escalationPersistenceError: string | null = null;
  let escalationDispatchWarning: string | null = null;
  let escalationPersisted = true;
  let escalationActiveCount = 0;
  let escalationOpenedCount = 0;
  let escalationResolvedCount = 0;
  let escalationDispatchedCount = 0;
  let escalationDispatchFailureCount = 0;

  if (processedUserIds.length === 0) {
    return {
      escalationEvaluationWarning,
      escalationPersistenceError,
      escalationDispatchWarning,
      escalationPersisted,
      escalationActiveCount,
      escalationOpenedCount,
      escalationResolvedCount,
      escalationDispatchedCount,
      escalationDispatchFailureCount,
    };
  }

  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const metricWarnings: string[] = [];

  const metricsByUser = new Map<string, UserEscalationMetrics>();
  processedUserIds.forEach((userId) => {
    metricsByUser.set(userId, {
      pendingRetries: 0,
      maxRetryAttempt: 0,
      deadLetters24h: 0,
      runs24h: 0,
      failures24h: 0,
      failureRate24h: 0,
    });
  });

  const [retryMetricsResult, deadLetterMetricsResult, runLogMetricsResult] = await Promise.all([
    supabase
      .from('sync_retry_queue')
      .select('user_id,retry_attempt')
      .in('user_id', processedUserIds)
      .limit(Math.max(200, processedUserIds.length * 50)),
    supabase
      .from('sync_retry_dead_letters')
      .select('user_id')
      .in('user_id', processedUserIds)
      .gte('created_at', since24hIso)
      .limit(Math.max(200, processedUserIds.length * 100)),
    supabase
      .from('sync_run_logs')
      .select('user_id,run_id,status')
      .in('user_id', processedUserIds)
      .gte('created_at', since24hIso)
      .limit(Math.max(500, processedUserIds.length * 250)),
  ]);

  if (retryMetricsResult.error) {
    if (isMissingTable(retryMetricsResult.error.code)) {
      metricWarnings.push('sync_retry_queue table is not available. Apply migration 006_sync_retry_queue.sql.');
    } else {
      metricWarnings.push(`Failed to evaluate retry queue metrics: ${retryMetricsResult.error.message}`);
    }
  } else {
    ((retryMetricsResult.data ?? []) as RetryQueueMetricRow[]).forEach((row) => {
      const metrics = metricsByUser.get(row.user_id);
      if (!metrics) return;

      metrics.pendingRetries += 1;
      metrics.maxRetryAttempt = Math.max(metrics.maxRetryAttempt, row.retry_attempt || 0);
    });
  }

  if (deadLetterMetricsResult.error) {
    if (isMissingTable(deadLetterMetricsResult.error.code)) {
      metricWarnings.push('sync_retry_dead_letters table is not available. Apply migration 007_sync_retry_dead_letters.sql.');
    } else {
      metricWarnings.push(`Failed to evaluate dead-letter metrics: ${deadLetterMetricsResult.error.message}`);
    }
  } else {
    ((deadLetterMetricsResult.data ?? []) as RetryDeadLetterMetricRow[]).forEach((row) => {
      const metrics = metricsByUser.get(row.user_id);
      if (!metrics) return;
      metrics.deadLetters24h += 1;
    });
  }

  if (runLogMetricsResult.error) {
    if (isMissingTable(runLogMetricsResult.error.code)) {
      metricWarnings.push('sync_run_logs table is not available. Apply migration 005_sync_run_logs.sql.');
    } else {
      metricWarnings.push(`Failed to evaluate scheduler run metrics: ${runLogMetricsResult.error.message}`);
    }
  } else {
    const runsByUser = new Map<string, Map<string, boolean>>();

    ((runLogMetricsResult.data ?? []) as RunLogMetricRow[]).forEach((row) => {
      if (!runsByUser.has(row.user_id)) {
        runsByUser.set(row.user_id, new Map());
      }

      const userRunMap = runsByUser.get(row.user_id)!;
      const hasFailure = userRunMap.get(row.run_id) ?? false;
      userRunMap.set(row.run_id, hasFailure || row.status === 'error');
    });

    runsByUser.forEach((userRunMap, userId) => {
      const metrics = metricsByUser.get(userId);
      if (!metrics) return;

      metrics.runs24h = userRunMap.size;
      metrics.failures24h = Array.from(userRunMap.values()).filter(Boolean).length;
      metrics.failureRate24h = metrics.runs24h > 0 ? metrics.failures24h / metrics.runs24h : 0;
    });
  }

  const activeCandidatesByKey = new Map<string, { userId: string; candidate: EscalationCandidate }>();
  metricsByUser.forEach((metrics, userId) => {
    const candidates = toEscalationCandidates(metrics);
    candidates.forEach((candidate) => {
      activeCandidatesByKey.set(toEscalationKey(userId, candidate.code), { userId, candidate });
    });
  });

  escalationActiveCount = activeCandidatesByKey.size;

  const { data: escalationRowsData, error: escalationRowsError } = await supabase
    .from('sync_escalation_events')
    .select('user_id,code,severity,status,owner,first_triggered_at,last_triggered_at,resolved_at,trigger_count,last_observed,threshold,message,last_dispatched_at,dispatch_count,metadata')
    .in('user_id', processedUserIds)
    .limit(Math.max(200, processedUserIds.length * 20));

  if (escalationRowsError) {
    escalationPersisted = false;
    if (isMissingTable(escalationRowsError.code)) {
      escalationPersistenceError =
        'sync_escalation_events table is not available. Apply migration 008_sync_escalation_events.sql.';
    } else {
      escalationPersistenceError = `Failed to read escalation events: ${escalationRowsError.message}`;
    }
    console.warn('[Cron Sync] Escalation persistence unavailable:', escalationPersistenceError);
  } else {
    const existingEscalationRows = (escalationRowsData ?? []) as EscalationEventRow[];
    const existingByKey = new Map(
      existingEscalationRows.map((row) => [toEscalationKey(row.user_id, row.code), row])
    );

    const nowIso = new Date().toISOString();
    const activeUpserts: Array<{
      user_id: string;
      code: string;
      severity: EscalationSeverity;
      status: EscalationStatus;
      owner: string;
      first_triggered_at: string;
      last_triggered_at: string;
      resolved_at: string | null;
      trigger_count: number;
      last_observed: number;
      threshold: number;
      message: string;
      last_dispatched_at: string | null;
      dispatch_count: number;
      metadata: Record<string, unknown>;
      updated_at: string;
    }> = [];

    const dispatchCandidates: DispatchCandidate[] = [];
    const activeKeys = new Set<string>();

    activeCandidatesByKey.forEach(({ userId, candidate }, key) => {
      activeKeys.add(key);
      const existing = existingByKey.get(key);
      const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};

      if (!existing || existing.status !== 'open') {
        escalationOpenedCount += 1;
      }

      activeUpserts.push({
        user_id: userId,
        code: candidate.code,
        severity: candidate.severity,
        status: 'open',
        owner: candidate.owner,
        first_triggered_at: !existing || existing.status !== 'open' ? nowIso : existing.first_triggered_at,
        last_triggered_at: nowIso,
        resolved_at: null,
        trigger_count: (existing?.trigger_count ?? 0) + 1,
        last_observed: candidate.observed,
        threshold: candidate.threshold,
        message: candidate.message,
        last_dispatched_at: existing?.last_dispatched_at ?? null,
        dispatch_count: existing?.dispatch_count ?? 0,
        metadata: {
          ...existingMetadata,
          lastEvaluatedAt: nowIso,
          lastRunId: runId,
          metrics: candidate.metrics,
        },
        updated_at: nowIso,
      });

      const shouldAttemptDispatch =
        !!webhookUrl &&
        (candidate.severity === 'critical' || includeWarning) &&
        shouldDispatchEscalation({
          lastDispatchedAt: existing?.last_dispatched_at ?? null,
        });

      if (shouldAttemptDispatch) {
        dispatchCandidates.push({
          userId,
          code: candidate.code,
          severity: candidate.severity,
          owner: candidate.owner,
          message: candidate.message,
          observed: candidate.observed,
          threshold: candidate.threshold,
          metrics: candidate.metrics,
          nextDispatchCount: (existing?.dispatch_count ?? 0) + 1,
        });
      }
    });

    const rowsToResolve = existingEscalationRows.filter((row) => {
      if (row.status !== 'open') {
        return false;
      }

      return !activeKeys.has(toEscalationKey(row.user_id, row.code));
    });

    escalationResolvedCount = rowsToResolve.length;

    if (activeUpserts.length > 0) {
      const { error: escalationUpsertError } = await supabase
        .from('sync_escalation_events')
        .upsert(activeUpserts, { onConflict: 'user_id,code' });

      if (escalationUpsertError) {
        escalationPersisted = false;
        escalationPersistenceError = `Failed to upsert escalation events: ${escalationUpsertError.message}`;
        console.warn('[Cron Sync] Failed to upsert escalation events:', escalationUpsertError.message);
      }
    }

    if (rowsToResolve.length > 0) {
      const resolveResults = await Promise.all(
        rowsToResolve.map((row) =>
          supabase
            .from('sync_escalation_events')
            .update({
              status: 'resolved',
              resolved_at: nowIso,
              updated_at: nowIso,
            })
            .eq('user_id', row.user_id)
            .eq('code', row.code)
        )
      );

      const firstResolveError = resolveResults.find((result) => result.error)?.error;
      if (firstResolveError) {
        escalationPersisted = false;
        escalationPersistenceError = `Failed to resolve escalation events: ${firstResolveError.message}`;
        console.warn('[Cron Sync] Failed to resolve escalation events:', firstResolveError.message);
      }
    }

    if (!webhookUrl && escalationActiveCount > 0) {
      escalationDispatchWarning =
        'SYNC_ESCALATION_WEBHOOK_URL is not configured. Escalations were persisted without outbound dispatch.';
    }

    if (dispatchCandidates.length > 0 && webhookUrl) {
      for (const candidate of dispatchCandidates) {
        const dispatchPayload = {
          service: 'the-eyes',
          event: 'sync-escalation',
          emittedAt: new Date().toISOString(),
          runId,
          userId: candidate.userId,
          code: candidate.code,
          severity: candidate.severity,
          owner: candidate.owner,
          message: candidate.message,
          observed: candidate.observed,
          threshold: candidate.threshold,
          metrics: candidate.metrics,
        };

        const dispatchResult = await dispatchEscalationWebhook(dispatchPayload, webhookUrl);
        if (!dispatchResult.success) {
          escalationDispatchFailureCount += dispatchResult.attempted ? 1 : 0;
          const message = dispatchResult.error || 'Unknown webhook dispatch error.';
          console.warn('[Cron Sync] Escalation webhook dispatch failed:', message);
          escalationDispatchWarning = escalationDispatchWarning
            ? `${escalationDispatchWarning} | ${candidate.code}:${message}`
            : `${candidate.code}:${message}`;
          continue;
        }

        const dispatchedAtIso = new Date().toISOString();
        const { error: dispatchUpdateError } = await supabase
          .from('sync_escalation_events')
          .update({
            last_dispatched_at: dispatchedAtIso,
            dispatch_count: candidate.nextDispatchCount,
            updated_at: dispatchedAtIso,
          })
          .eq('user_id', candidate.userId)
          .eq('code', candidate.code);

        if (dispatchUpdateError) {
          escalationPersisted = false;
          escalationPersistenceError = `Failed to update escalation dispatch metadata: ${dispatchUpdateError.message}`;
          console.warn('[Cron Sync] Failed to persist escalation dispatch metadata:', dispatchUpdateError.message);
          continue;
        }

        escalationDispatchedCount += 1;
      }
    }
  }

  if (metricWarnings.length > 0) {
    escalationEvaluationWarning = metricWarnings.join(' | ');
  }

  return {
    escalationEvaluationWarning,
    escalationPersistenceError,
    escalationDispatchWarning,
    escalationPersisted,
    escalationActiveCount,
    escalationOpenedCount,
    escalationResolvedCount,
    escalationDispatchedCount,
    escalationDispatchFailureCount,
  };
}
