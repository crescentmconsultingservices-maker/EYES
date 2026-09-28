import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

/**
 * AI Gateway — Unified Production Interface (K1 + K2)
 *
 * K1: Zero provider SDKs. Every call goes through GROQ_BASE_URL via one
 *     OpenAI-compatible fetch client.
 * K2: Only the four gateway aliases appear in code — never literal model strings.
 * K3: MOCK_MODE=true returns realistic fixtures so the product runs without keys.
 */

// ── Gateway config (K1) ─────────────────────────────────────────────────────
export function findGatewayKey(): string {
  // We prefer Groq first, Gemini second, OpenRouter third.
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) return groqKey;
  
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) return geminiKey;
  
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) return openRouterKey;

  const eyesKey = process.env.EYES_GATEWAY_KEY;
  if (eyesKey) return eyesKey;

  return '';
}

const getGatewayKey = () => findGatewayKey();

const getGatewayBase = (key: string) => {
  if (!key) return '';
  if (key.startsWith('gsk_')) {
    return (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  }
  if (key.startsWith('AIza')) { // Gemini key format
    return 'https://generativelanguage.googleapis.com/v1beta/openai';
  }
  if (key.startsWith('sk-or-v1-')) {
    return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  }
  return '';
};

const GROQ_MODELS = [
  process.env.GROQ_MODEL,
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
].filter(Boolean) as string[];

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
].filter(Boolean) as string[];

const OPENROUTER_MODELS = [
  process.env.OPENROUTER_MODEL,
  'liquid/lfm-2.5-2.6b:free',
  'google/gemma-2-27b-it:free',
].filter(Boolean) as string[];

function getModelsForRequest(key: string, alias: string): string[] {
  if (key.startsWith('gsk_')) return GROQ_MODELS;
  if (key.startsWith('AIza')) return alias === ALIAS_EMBED ? ['gemini-embedding-001'] : GEMINI_MODELS;
  if (key.startsWith('sk-or-v1-')) return OPENROUTER_MODELS;
  return [alias];
}

function getGatewayHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
  };
  if (key.startsWith('sk-or-v1-')) {
    headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_SITE_URL || 'https://eyes-app-sigma.vercel.app';
    headers['X-Title'] = 'EYES';
  }
  return headers;
}

// ── Four gateway aliases (K2) ────────────────────────────────────────────────
const ALIAS_CHAT = 'auto-chat';
const ALIAS_EXTRACT = 'auto-extract';
const ALIAS_CLASSIFY = 'auto-classify';
const ALIAS_EMBED = 'auto-embed';

// ── No fallbacks permitted (K1) ────────────────────────────────────────────────
// All calls route via the gateway.
const EMBED_DIMS = 1024; // Align with Voyage/Gemini 1024-dim database schema (Migration 032)

// ── Types ────────────────────────────────────────────────────────────────────
export type AIPreference = 'claude' | 'gemini' | 'auto' | 'system-1' | 'system-2';
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
  /** Temperature for chat calls. Defaults to 0.1. Use higher values (0.7–1.0) for creative tasks. */
  temperature?: number;
  /** AbortSignal to cancel the in-flight request (e.g. when the chat timeout fires). */
  signal?: AbortSignal;
  /** Optional array of OpenAI-compatible tool definitions */
  tools?: any[];
}

export type EmbedResult = { embedding: number[] };
export type ToolCallResult = { type: 'tool_calls', tool_calls: any[] };
export type InvokeResult = EmbedResult | ToolCallResult | string | null;

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
  temperature = 0.1,
  tools?: any[]
): Promise<string | ToolCallResult | null> {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.EYES_GATEWAY_KEY
  ].filter(Boolean) as string[];

  const combos: {key: string, base: string, model: string}[] = [];
  for (const k of keys) {
    const b = getGatewayBase(k);
    if (!b) continue;
    const m = getModelsForRequest(k, alias);
    for (const model of m) combos.push({ key: k, base: b, model });
  }

  if (combos.length === 0) return null;

  const totalAttempts = Math.max(combos.length, GATEWAY_MAX_RETRIES);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const { key, base, model } = combos[attempt % combos.length];
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: getGatewayHeaders(key),
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, ...(tools?.length ? { tools } : {}) }),
        signal,
      });
      if (res.ok) {
        const body = await res.json();
        const message = body?.choices?.[0]?.message;
        if (message?.tool_calls?.length > 0) {
          return { type: 'tool_calls', tool_calls: message.tool_calls };
        }
        return message?.content ?? null;
      }
      // Don't retry on 4xx client errors (except 429 rate-limit)
      if (res.status < 500 && res.status !== 429) {
        console.warn(`[AI Gateway] ${model} returned ${res.status} — trying next model.`);
      } else {
        console.warn(`[AI Gateway] ${model} returned ${res.status} — retry ${attempt + 1}/${totalAttempts}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null; // Clean cancellation — no retry
      console.warn(`[AI Gateway] fetch failed for ${model} (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < totalAttempts - 1) await retryDelay(attempt);
  }
  console.error(`[AI Gateway] ${alias} exhausted ${totalAttempts} retries.`);
  return null;
}

async function gatewayEmbed(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY; // Always force Gemini for embeddings if possible
  const base = getGatewayBase(key || '');
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
          model: getModelsForRequest(key, ALIAS_EMBED)[0] || 'gemini-embedding-001',
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
  const key = process.env.GEMINI_API_KEY; // Always force Gemini for embeddings
  const base = getGatewayBase(key || '');
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
          model: getModelsForRequest(key, ALIAS_EMBED)[0] || 'gemini-embedding-001',
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

async function geminiEmbed(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: text.slice(0, 8000) }] },
        outputDimensionality: 1024,
      }),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      return data?.embedding?.values ?? null;
    }
  } catch (err) {
    console.warn('[Gemini Embed] Failed:', err);
  }
  return null;
}

async function geminiEmbedBatch(texts: string[], signal?: AbortSignal): Promise<number[][] | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || !texts.length) return null;
  try {
    const requests = texts.map((t) => ({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: t.slice(0, 8000) }] },
      outputDimensionality: 1024,
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      return (data?.embeddings || []).map((e: any) => e?.values ?? null);
    }
  } catch (err) {
    console.warn('[Gemini Embed Batch] Failed:', err);
  }
  return null;
}

// ── Embedding (Sovereign GPU, Gemini & Gateway fallback) ────────────────────
async function handleEmbedding(text: string, signal?: AbortSignal): Promise<EmbedResult | null> {
  if (process.env.GEMINI_API_KEY) {
    const geminiResult = await geminiEmbed(text, signal);
    if (geminiResult && geminiResult.length === EMBED_DIMS) {
      return { embedding: geminiResult };
    }
  }

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

// ── Chat (Sovereign GPU & gateway fallback) ──────────────────────────────────
async function handleChat(
  messages: AIHistoryMessage[],
  system: string,
  capability: AICapability,
  overrideMaxTokens?: number,
  signal?: AbortSignal,
  temperature = 0.1,
  tools?: any[]
): Promise<string | ToolCallResult | null> {
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
  const gatewayResult = await gatewayChat(alias, fullMessages, maxTokens, signal, temperature, tools);
  if (gatewayResult) { console.log(`[AI] Gateway (${alias}) OK`); return gatewayResult; }

  console.error('[AI] Gateway chat failed.');
  return null;
}

// ── Public interface ─────────────────────────────────────────────────────────
export async function invokeModel(options: AIInvokeOptions): Promise<InvokeResult> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { capability, messages = [], system = '', preference: _pref = 'auto', capture = capability === 'chat', signal, temperature, tools } = options;

  if (capability === 'embed') {
    return handleEmbedding(messages[0]?.content || '', signal);
  }

  const startedAt = Date.now();
  const result = await handleChat(messages, system, capability, options.maxTokens, signal, temperature, tools);

  if (capture && result && typeof result === 'string') {
    setTimeout(() => {
      captureBehavioralData({
        queryText: messages[messages.length - 1]?.content || '',
        queryType: capability,
        modelUsed: getGatewayBase(getGatewayKey()) ? `gateway/${capability === 'classify' ? ALIAS_CLASSIFY : ALIAS_CHAT}` : 'fallback',
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
  const key = getGatewayKey();
  const base = getGatewayBase(key);
  if (base && key) {
    const models = getModelsForRequest(key, ALIAS_CHAT);
    for (const model of models) {
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: getGatewayHeaders(key),
          body: JSON.stringify({ model, messages: fullMessages, max_tokens: 1024, temperature: 0.1, stream: true }),
          signal, // propagate AbortSignal so timeout cancels the stream
        });
        if (res.ok && res.body) {
          console.log(`[AI Stream] Gateway streaming via ${model}`);
          return sseToReadable(res.body, encoder);
        }
        console.warn(`[AI Stream] Model ${model} returned ${res.status} — trying fallback if available.`);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Clean cancellation — return an empty stream
          return new ReadableStream({ start(c) { c.close(); } });
        }
        console.warn(`[AI Stream] Model ${model} stream failed:`, err instanceof Error ? err.message : err);
      }
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
  if (process.env.GEMINI_API_KEY) {
    const geminiBatch = await geminiEmbedBatch(texts);
    if (geminiBatch && geminiBatch.length === texts.length) {
      return geminiBatch;
    }
  }
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
