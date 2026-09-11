import { Client } from '@upstash/qstash';

export interface DispatchSyncJobOptions {
  userId: string;
  platform: string;
  mode?: string;
  cursor?: string | null;
  delaySeconds?: number;
}

/**
 * Dispatches a background connector sync job via Upstash QStash.
 * Used for chaining large historical backfills (50,000+ items)
 * without exceeding Vercel serverless execution timeouts or third-party rate limits.
 */
export async function dispatchNextSyncJob(
  options: DispatchSyncJobOptions
): Promise<{ enqueued: boolean; messageId?: string; reason?: string }> {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) {
    return { enqueued: false, reason: 'QSTASH_TOKEN not configured' };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!siteUrl) {
    return { enqueued: false, reason: 'Site URL not configured' };
  }

  try {
    const qstash = new Client({ token: qstashToken });
    const delay = options.delaySeconds ?? 3; // 3 seconds standard backoff to avoid API 429s

    const destinationUrl = `${siteUrl.replace(/\/$/, '')}/api/queue/sync`;

    const res = await qstash.publishJSON({
      url: destinationUrl,
      body: {
        userId: options.userId,
        platform: options.platform,
        mode: options.mode || 'backfill',
        cursor: options.cursor,
      },
      delay,
    });

    console.log(
      `[QStash Sync] Enqueued background batch for user ${options.userId} platform ${options.platform} with delay ${delay}s (msgId: ${res.messageId})`
    );

    return { enqueued: true, messageId: res.messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[QStash Sync] Failed to enqueue background sync for ${options.platform}:`, errorMsg);
    return { enqueued: false, reason: errorMsg };
  }
}
