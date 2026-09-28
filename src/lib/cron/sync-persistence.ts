import { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTable } from './sync-utils';
import { logCronMetrics } from './monitoring';

export async function persistSyncResults(
  supabase: SupabaseClient,
  syncRunLogs: any[],
  retryQueueReady: boolean,
  dedupedRetryQueueUpserts: any[],
  retryQueueDeleteRows: any[],
  retryDeadLetters: any[],
  retryQueueWarning: string | null
) {
  let logPersistenceError: string | null = null;
  
  if (syncRunLogs.length > 0) {
    const { error: runLogError } = await supabase.from('sync_run_logs').insert(syncRunLogs);
    if (runLogError) {
      logPersistenceError = runLogError.message;
      console.warn('[Cron Sync] Failed to persist sync run logs:', runLogError.message);
    }
  }

  let retryQueuePersistenceError: string | null = retryQueueWarning;
  let retryQueuePersisted = retryQueueReady;
  let deadLetterPersistenceError: string | null = null;
  let deadLetterPersisted = true;

  if (retryQueueReady) {
    if (dedupedRetryQueueUpserts.length > 0) {
      const { error: retryUpsertError } = await supabase
        .from('sync_retry_queue')
        .upsert(dedupedRetryQueueUpserts, { onConflict: 'user_id,platform' });

      if (retryUpsertError) {
        retryQueuePersisted = false;
        retryQueuePersistenceError = \`Failed to upsert retry queue: \${retryUpsertError.message}\`;
        console.warn('[Cron Sync] Failed to upsert retry queue:', retryUpsertError.message);
      }
    }

    if (retryQueueDeleteRows.length > 0) {
      const deleteResults = await Promise.all(
        retryQueueDeleteRows.map((row) =>
          supabase.from('sync_retry_queue').delete().eq('user_id', row.userId).eq('platform', row.platform)
        )
      );

      const firstDeleteError = deleteResults.find((result) => result.error)?.error;
      if (firstDeleteError) {
        retryQueuePersisted = false;
        retryQueuePersistenceError = \`Failed to clear retry queue rows: \${firstDeleteError.message}\`;
        console.warn('[Cron Sync] Failed to clear retry queue rows:', firstDeleteError.message);
      }
    }
  }

  if (retryDeadLetters.length > 0) {
    const { error: deadLetterInsertError } = await supabase.from('sync_retry_dead_letters').insert(retryDeadLetters);
    if (deadLetterInsertError) {
      deadLetterPersisted = false;
      if (isMissingTable(deadLetterInsertError.code)) {
        deadLetterPersistenceError = 'sync_retry_dead_letters table is not available. Apply migration 007_sync_retry_dead_letters.sql.';
      } else {
        deadLetterPersistenceError = \`Failed to persist retry dead letters: \${deadLetterInsertError.message}\`;
      }
      console.warn('[Cron Sync] Failed to persist retry dead letters:', deadLetterPersistenceError);
    }
  }

  return {
    logPersistenceError,
    retryQueuePersisted,
    retryQueuePersistenceError,
    deadLetterPersisted,
    deadLetterPersistenceError,
  };
}

export async function persistCronMetrics(
  supabase: SupabaseClient,
  metricsData: any
) {
  const cronMetricsResult = await logCronMetrics(supabase, metricsData);
  let monitoringWarning: string | null = null;

  if (!cronMetricsResult.success) {
    monitoringWarning = \`Cron metrics logging failed: \${cronMetricsResult.error}\`;
    console.warn('[Cron Sync] Monitoring:', monitoringWarning);
  }

  return {
    success: cronMetricsResult.success,
    warning: monitoringWarning,
  };
}
