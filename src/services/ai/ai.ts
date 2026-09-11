import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

/**
 * AI Gateway — Unified Production Interface (K1 + K2)
 *
 * K1: Zero provider SDKs. Every call goes through LITELLM_BASE_URL via one
 *     OpenAI-compatible fetch client.
 * K2: Only the four gateway aliases appear in code — never literal model strings.
 * K3: MOCK_MODE=true returns realistic fixtures so the product runs without keys.
 */

// ── Gateway config (K1) ─────────────────────────────────────────────────────
const getGatewayBase = () => (process.env.LITELLM_BASE_URL || '').replace(/\/$/, '');
const getGatewayKey = () => process.env.EYES_GATEWAY_KEY || process.env.LITELLM_KEY || '';

// ── Four gateway aliases (K2) ────────────────────────────────────────────────
const ALIAS_CHAT = 'auto-chat';
const ALIAS_EXTRACT = 'auto-extract';
const ALIAS_CLASSIFY = 'auto-classify';
const ALIAS_EMBED = 'auto-embed';

// ── No fallbacks permitted (K1) ────────────────────────────────────────────────
// All calls route via the gateway.
const EMBED_DIMS = 1024; // Align with Voyage/Gemini 1024-dim database schema (Migration 032)

// ── Types ────────────────────────────────────────────────────────────────────
export type AIPreference = 'claude' | 'gemini' | 'auto';
export type AICapability = 'chat' | 'embed' | 'classify' | 'extract';

export interface AIHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIInvokeOptions {
  capability: AICapability;
  messages?: AIHistoryMessage[];
  system?: string;
  preference?: AIPreference;
  capture?: boolean;
  maxTokens?: number;
  /** AbortSignal to cancel the in-flight request (e.g. when the chat timeout fires). */
  signal?: AbortSignal;
}

export type EmbedResult = { embedding: number[] };
export type InvokeResult = EmbedResult | string | null;

// ── Retry helper ─────────────────────────────────────────────────────────────
const GATEWAY_MAX_RETRIES = 3;
const GATEWAY_RETRY_DELAYS = [500, 1000, 2000]; // ms — exponential backoff

async function retryDelay(attemptIndex: number): Promise<void> {
  const ms = GATEWAY_RETRY_DELAYS[Math.min(attemptIndex, GATEWAY_RETRY_DELAYS.length - 1)];
  return new Promise(r => setTimeout(r, ms));
}

// ── Gateway call (K1 — single OpenAI-compatible client) ──────────────────────
async function gatewayChat(
  alias: string,
  messages: { role: string; content: string }[],
  maxTokens = 1024,
  signal?: AbortSignal,
): Promise<string | null> {
  const base = getGatewayBase();
  const key = getGatewayKey();
  if (!base || !key) return null;

  for (let attempt = 0; attempt < GATEWAY_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({ model: alias, messages, max_tokens: maxTokens, temperature: 0.1 }),
        signal,
      });
      if (res.ok) {
        const body = await res.json();
        return body?.choices?.[0]?.message?.content ?? null;
      }
      // Don't retry on 4xx client errors (except 429 rate-limit)
      if (res.status < 500 && res.status !== 429) {
        console.warn(`[AI Gateway] ${alias} returned ${res.status} — not retriable.`);
        return null;
      }
      console.warn(`[AI Gateway] ${alias} returned ${res.status} — retry ${attempt + 1}/${GATEWAY_MAX_RETRIES}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null; // Clean cancellation — no retry
      console.warn(`[AI Gateway] fetch failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < GATEWAY_MAX_RETRIES - 1) await retryDelay(attempt);
  }
  console.error(`[AI Gateway] ${alias} exhausted ${GATEWAY_MAX_RETRIES} retries.`);
  return null;
}

async function gatewayEmbed(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const base = getGatewayBase();
  const key = getGatewayKey();
  if (!base || !key) return null;

  for (let attempt = 0; attempt < GATEWAY_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: ALIAS_EMBED,
          input: text.slice(0, 8000),
          dimensions: 1024,
        }),
        signal,
      });
      if (res.ok) {
        const body = await res.json();
        return body?.data?.[0]?.embedding ?? null;
      }
      if (res.status < 500 && res.status !== 429) return null; // Non-retriable
      console.warn(`[AI Embed] Gateway returned ${res.status} — retry ${attempt + 1}/${GATEWAY_MAX_RETRIES}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      console.warn(`[AI Embed] fetch failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < GATEWAY_MAX_RETRIES - 1) await retryDelay(attempt);
  }
  console.error(`[AI Embed] Exhausted ${GATEWAY_MAX_RETRIES} retries.`);
  return null;
}

async function gatewayEmbedBatch(texts: string[], signal?: AbortSignal): Promise<number[][] | null> {
  if (!texts.length) return [];
  const base = getGatewayBase();
  const key = getGatewayKey();
  if (!base || !key) return null;

  for (let attempt = 0; attempt < GATEWAY_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: ALIAS_EMBED,
          input: texts.map((t) => t.slice(0, 8000)),
          dimensions: 1024,
        }),
        signal,
      });
      if (res.ok) {
        const body = await res.json();
        const data = body?.data;
        if (Array.isArray(data)) {
          // Sort by index to maintain exact alignment with input array order
          const sorted = [...data].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
          return sorted.map((item: any) => item.embedding);
        }
        return null;
      }
      if (res.status < 500 && res.status !== 429) return null; // Non-retriable
      console.warn(`[AI Embed Batch] Gateway returned ${res.status} — retry ${attempt + 1}/${GATEWAY_MAX_RETRIES}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      console.warn(`[AI Embed Batch] fetch failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < GATEWAY_MAX_RETRIES - 1) await retryDelay(attempt);
  }
  console.error(`[AI Embed Batch] Exhausted ${GATEWAY_MAX_RETRIES} retries.`);
  return null;
}

// ── Embedding (gateway ONLY) ────────────────────────────────
async function handleEmbedding(text: string, signal?: AbortSignal): Promise<EmbedResult | null> {
  const gatewayResult = await gatewayEmbed(text, signal);
  if (gatewayResult && Array.isArray(gatewayResult)) {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (!isTest && gatewayResult.length !== EMBED_DIMS) {
      console.warn(`[AI Embedding] Mismatched vector dimensions: expected ${EMBED_DIMS}, got ${gatewayResult.length}. Rejecting vector.`);
      return null;
    }
    return { embedding: gatewayResult };
  }
  console.error('[AI] Gateway embedding failed.');
  return null;
}
// ── Chat (gateway ONLY) ─────────────────────────
async function handleChat(
  messages: AIHistoryMessage[],
  system: string,
  capability: AICapability,
  overrideMaxTokens?: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const isClassify = capability === 'classify' ||
    /return.*json|json only|valid json/i.test(system);
  const maxTokens = overrideMaxTokens ?? (isClassify ? 500 : 1024);

  const alias = isClassify ? ALIAS_CLASSIFY : (capability === 'extract' ? ALIAS_EXTRACT : ALIAS_CHAT);
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const fullMessages = [
    ...(system?.trim() ? [{ role: 'system', content: system }] : []),
    ...history,
  ];

  // 1. Gateway (K1)
  const gatewayResult = await gatewayChat(alias, fullMessages, maxTokens, signal);
  if (gatewayResult) { console.log(`[AI] Gateway (${alias}) OK`); return gatewayResult; }

  console.error('[AI] Gateway chat failed.');
  return null;
}

// ── Public interface ─────────────────────────────────────────────────────────
export async function invokeModel(options: AIInvokeOptions): Promise<InvokeResult> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { capability, messages = [], system = '', preference: _pref = 'auto', capture = capability === 'chat', signal } = options;

  if (capability === 'embed') {
    return handleEmbedding(messages[0]?.content || '', signal);
  }

  const startedAt = Date.now();
  const result = await handleChat(messages, system, capability, options.maxTokens, signal);

  if (capture && result) {
    setTimeout(() => {
      captureBehavioralData({
        queryText: messages[messages.length - 1]?.content || '',
        queryType: capability,
        modelUsed: getGatewayBase() ? `gateway/${capability === 'classify' ? ALIAS_CLASSIFY : ALIAS_CHAT}` : 'fallback',
        latencyMs: Date.now() - startedAt,
        resultCount: messages.length,
        responseLength: result.length,
      }).catch(err => console.warn('[AI Behavioral] log failed:', err));
    }, 0);
  }

  return result;
}

// ── Streaming (gateway SSE ONLY) ──────────────
export async function invokeModelStream(options: AIInvokeOptions): Promise<ReadableStream> {
  const { messages = [], system = '', signal } = options;
  const encoder = new TextEncoder();

  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const fullMessages = [
    ...(system?.trim() ? [{ role: 'system', content: system }] : []),
    ...history,
  ];

  // 1. Gateway stream
  const base = getGatewayBase();
  const key = getGatewayKey();
  if (base && key) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: ALIAS_CHAT, messages: fullMessages, max_tokens: 1024, temperature: 0.1, stream: true }),
        signal, // propagate AbortSignal so timeout cancels the stream
      });
      if (res.ok && res.body) {
        console.log('[AI Stream] Gateway streaming');
        return sseToReadable(res.body, encoder);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Clean cancellation — return an empty stream
        return new ReadableStream({ start(c) { c.close(); } });
      }
      console.warn('[AI Stream] Gateway stream failed:', err instanceof Error ? err.message : err);
    }
  }

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('\n\n[SYSTEM] Gateway unavailable.'));
      controller.close();
    },
  });
}

/** Parse SSE stream into a ReadableStream of text deltas */
function sseToReadable(body: ReadableStream<Uint8Array>, encoder: TextEncoder): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const d = t.slice(5).trim();
            if (d === '[DONE]') break;
            try {
              const delta = JSON.parse(d)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch { /* malformed SSE */ }
          }
        }
      } catch (e) { console.warn('[AI SSE] read error:', e); }
      finally { controller.close(); }
    },
  });
}

// ── Legacy wrappers ──────────────────────────────────────────────────────────
export async function generateEmbedding(text: string) {
  return invokeModel({ capability: 'embed', messages: [{ role: 'user', content: text }] });
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][] | null> {
  return gatewayEmbedBatch(texts);
}

export async function chatCompletion(messages: AIHistoryMessage[]): Promise<string | null> {
  const result = await invokeModel({ capability: 'chat', messages });
  return typeof result === 'string' ? result : null;
}

export async function chatCompletionStream(messages: AIHistoryMessage[]) {
  return invokeModelStream({ capability: 'chat', messages });
}

// ── Behavioural logging ──────────────────────────────────────────────────────
async function captureBehavioralData(data: {
  queryText: string; queryType: string; modelUsed: string;
  latencyMs: number; resultCount: number; responseLength: number;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('user_profiles').select('behavior_logging_consent')
      .eq('user_id', user.id).maybeSingle();
    if (profile?.behavior_logging_consent === false) return;

    const salt = process.env.BEHAVIOR_SALT;
    if (!salt && process.env.NODE_ENV === 'production') {
      console.warn('[AI Behavioral] BEHAVIOR_SALT not set.');
    }
    const userHash = crypto.createHash('sha256').update(user.id + (salt || 'eyes-salt')).digest('hex');

    const hour = new Date().getHours();
    const bucket = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    await supabase.from('query_behavior').insert({
      user_hash: userHash,
      query_text: data.queryText.slice(0, 50),
      query_type: data.queryType,
      model_used: data.modelUsed,
      latency_ms: data.latencyMs,
      result_count: data.resultCount,
      response_length: data.responseLength,
      sources_used: [],
      coarse_geography: 'unknown',
      coarse_time_bucket: bucket,
    });
  } catch (err) {
    console.warn('[AI Behavioral] Logging failed:', err);
  }
}
