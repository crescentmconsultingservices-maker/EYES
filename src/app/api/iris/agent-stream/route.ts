import { NextResponse } from 'next/server';
import { runAgentOrchestrator } from '@/services/mcp/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const task = searchParams.get('task') || 'default task';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send headers to prevent caching
      controller.enqueue(encoder.encode(`event: connected\ndata: {"status": "started"}\n\n`));

      await runAgentOrchestrator(task, (data) => {
        const message = `data: ${JSON.stringify({ text: data })}\n\n`;
        controller.enqueue(encoder.encode(message));
      });

      controller.enqueue(encoder.encode(`event: done\ndata: {"status": "completed"}\n\n`));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
