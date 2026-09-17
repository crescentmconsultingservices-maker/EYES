import { NextResponse } from 'next/server';
import { runAgentOrchestrator } from '@/services/mcp/client';
import { withHeartbeat } from '@/utils/stream/sse-heartbeat';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const task = searchParams.get('task') || 'default task';

  const encoder = new TextEncoder();
  const rawStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send headers to prevent caching
      controller.enqueue(encoder.encode(`event: connected\ndata: {"status": "started"}\n\n`));

      try {
        await runAgentOrchestrator(task, (data) => {
          const message = `data: ${JSON.stringify({ text: data })}\n\n`;
          controller.enqueue(encoder.encode(message));
        });

        controller.enqueue(encoder.encode(`event: done\ndata: {"status": "completed"}\n\n`));
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  // Inject keep-alive heartbeat comments (: keep-alive\n\n) every 15s during idle execution
  const stream = withHeartbeat(rawStream, { intervalMs: 15000 });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

