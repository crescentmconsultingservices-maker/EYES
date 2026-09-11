/**
 * High-Throughput Batch Embedding Worker for ALL users.
 *
 * Scans the `memories` table for rows with embedding IS NULL,
 * generates 1024-dim vectors in batches via the AI Gateway (auto-embed),
 * and writes them back concurrently to memories.embedding.
 *
 * Automatically chains follow-up batches via QStash if a backlog remains.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { generateEmbeddingsBatch } from '@/services/ai/ai';

/** Batch size per gateway call (keep 50-100 for optimal latency & token payload) */
const BATCH_SIZE = Number(process.env.EMBEDDING_QUEUE_BATCH_SIZE || 50);

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret) return xSecret.trim();
  return null;
}

function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

async function chainNextEmbeddingBatch(secret: string): Promise<void> {
  const qstashToken = process.env.QSTASH_TOKEN;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!qstashToken || !siteUrl) return;

  try {
    const { Client } = await import('@upstash/qstash');
    const qstash = new Client({ token: qstashToken });
    await qstash.publishJSON({
      url: `${siteUrl.replace(/\/$/, '')}/api/cron/embeddings`,
      headers: {
        'x-cron-secret': secret,
      },
      body: {},
      delay: 2, // 2-second breathing window
    });
    console.log('[Cron Embeddings] Enqueued next embedding batch via QStash.');
  } catch (err) {
    console.warn('[Cron Embeddings] Failed to enqueue next batch via QStash:', err);
  }
}

/**
 * POST /api/cron/embeddings
 * Processes a high-throughput batch of un-embedded memories across all users.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchSize = Number(process.env.EMBEDDING_QUEUE_BATCH_SIZE || 50);
  const startedAt = Date.now();
  const supabase = createAdminClient();
  const cronSecret = process.env.CRON_SECRET || '';

  try {
    // ── 1. Fetch a batch of memories missing embeddings (across ALL users) ────
    const { data: memories, error: fetchError } = await supabase
      .from('memories')
      .select('id, user_id, platform, title, content')
      .is('embedding', null)
      .not('content', 'is', null)
      .order('synced_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      console.error('[Cron Embeddings] Failed to fetch memories:', fetchError.message);
      return NextResponse.json(
        { error: 'Failed to fetch embedding backlog', detail: fetchError.message },
        { status: 500 }
      );
    }

    if (!memories || memories.length === 0) {
      return NextResponse.json({
        message: 'No memories pending embedding — index is current.',
        processed: 0,
        hasMore: false,
        durationMs: Date.now() - startedAt,
      });
    }

    console.log(`[Cron Embeddings] Batch processing ${memories.length} un-embedded memories...`);

    // Prepare non-empty text payloads
    const validMemories = memories
      .map((m) => ({
        id: m.id,
        user_id: m.user_id,
        platform: m.platform,
        text: [m.title, m.content].filter(Boolean).join('\n').slice(0, 8000).trim(),
      }))
      .filter((m) => m.text.length > 0);

    if (validMemories.length === 0) {
      return NextResponse.json({
        message: 'All items in batch had empty text.',
        processed: 0,
        hasMore: memories.length === batchSize,
        durationMs: Date.now() - startedAt,
      });
    }

    // ── 2. High-throughput Batch Embedding via Gateway ───────────────────────
    const texts = validMemories.map((m) => m.text);
    const embeddings = await generateEmbeddingsBatch(texts);

    if (!embeddings || !Array.isArray(embeddings) || embeddings.length !== validMemories.length) {
      console.error('[Cron Embeddings] Batch embedding generation returned invalid payload.');
      return NextResponse.json(
        { error: 'Batch embedding generation failed' },
        { status: 502 }
      );
    }

    // ── 3. Concurrent Vector Writes to Supabase ──────────────────────────────
    const updatePromises = validMemories.map((m, idx) => {
      const vector = embeddings[idx];
      if (!vector || !Array.isArray(vector)) {
        return Promise.reject(new Error(`Missing vector for memory ${m.id}`));
      }
      return supabase
        .from('memories')
        .update({
          embedding: vector,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id)
        .eq('user_id', m.user_id);
    });

    const results = await Promise.allSettled(updatePromises);
    let successCount = 0;
    let failureCount = 0;

    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        successCount++;
      } else {
        failureCount++;
      }
    });

    const hasMore = memories.length === batchSize;

    // Auto-chain remaining backlog via QStash
    if (hasMore) {
      await chainNextEmbeddingBatch(cronSecret);
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[Cron Embeddings] Batch complete — success=${successCount} failed=${failureCount} hasMore=${hasMore} duration=${durationMs}ms`
    );

    return NextResponse.json({
      message: 'Batch embedding complete.',
      processed: successCount,
      failed: failureCount,
      total: memories.length,
      hasMore,
      durationMs,
    });
  } catch (err) {
    console.error('[Cron Embeddings] Fatal error:', err);
    return NextResponse.json(
      { error: 'Embedding cron failed', detail: String(err) },
      { status: 500 }
    );
  }
}

/** Support manual triggers for testing without a scheduler. */
export async function GET(request: Request) {
  return POST(request);
}
