/**
 * SSE & Streaming Keep-Alive Heartbeat Transformer.
 *
 * Reverse proxies (Vercel Edge, Cloudflare, Fly.io, Nginx) drop idle HTTP/SSE connections
 * if no byte is received within 15-30 seconds. This utility injects standard SSE
 * comment heartbeats (`: keep-alive\n\n`) during idle intervals, keeping the socket
 * active during long LLM reasoning, multi-hop tool chains, or DB queries.
 */

export interface HeartbeatOptions {
  /** Heartbeat interval in milliseconds (default: 15,000ms / 15s) */
  intervalMs?: number;
  /** Custom heartbeat payload (default: ': keep-alive\n\n') */
  commentPayload?: string;
}

/**
 * Wraps a ReadableStream with keep-alive heartbeat comments during idle periods.
 */
export function withHeartbeat(
  stream: ReadableStream<Uint8Array>,
  options: HeartbeatOptions = {}
): ReadableStream<Uint8Array> {
  const intervalMs = options.intervalMs ?? 15000;
  const commentPayload = options.commentPayload ?? ': keep-alive\n\n';
  const encoder = new TextEncoder();
  const heartbeatBytes = encoder.encode(commentPayload);

  let timer: ReturnType<typeof setInterval> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = stream.getReader();

      const clearTimer = () => {
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };

      const resetTimer = () => {
        clearTimer();
        timer = setInterval(() => {
          try {
            controller.enqueue(heartbeatBytes);
          } catch {
            clearTimer();
          }
        }, intervalMs);
      };

      resetTimer();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetTimer();
          controller.enqueue(value);
        }
        clearTimer();
        controller.close();
      } catch (err) {
        clearTimer();
        controller.error(err);
      } finally {
        clearTimer();
        try {
          reader.releaseLock();
        } catch {
          // Lock already released
        }
      }
    },
    async cancel(reason) {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      if (reader) {
        try {
          await reader.cancel(reason);
        } catch {
          // Reader might already be cancelled/closed
        }
      }
    },
  });
}
