import { describe, it, expect } from 'vitest';
import { withHeartbeat } from '../sse-heartbeat';

describe('SSE Keep-Alive Heartbeat Transformer', () => {
  it('passes chunks through unmodified', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('chunk-1'));
        controller.enqueue(encoder.encode('chunk-2'));
        controller.close();
      },
    });

    const stream = withHeartbeat(readable, { intervalMs: 10000 });
    const reader = stream.getReader();

    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    expect(chunks).toEqual(['chunk-1', 'chunk-2']);
  });

  it('injects heartbeat comment when stream is idle', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('start'));
        // Send next chunk after 80ms (interval is 25ms)
        setTimeout(() => {
          controller.enqueue(encoder.encode('end'));
          controller.close();
        }, 80);
      },
    });

    const stream = withHeartbeat(readable, { intervalMs: 25, commentPayload: ': ping\n\n' });
    const reader = stream.getReader();

    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    expect(chunks[0]).toBe('start');
    expect(chunks).toContain(': ping\n\n');
    expect(chunks[chunks.length - 1]).toBe('end');
  });

  it('cleans up cleanly when reader cancels', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('first'));
      },
    });

    const stream = withHeartbeat(readable, { intervalMs: 30 });
    const reader = stream.getReader();

    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe('first');

    await reader.cancel('User aborted');
    const second = await reader.read();
    expect(second.done).toBe(true);
  });
});
