import { NextResponse } from 'next/server';
import { inngest } from '@/services/inngest/client';

export async function POST(request: Request) {
  try {
    let body: { event?: string; data?: Record<string, unknown> } = {};
    try {
      body = await request.json();
    } catch {
      // Default to empty body if no payload passed
    }

    const eventName = (body.event || 'iris/investigate.churn') as any;
    const eventData = body.data || { taskId: `task_${Date.now()}` };

    await inngest.send({
      name: eventName,
      data: eventData,
    });
    
    return NextResponse.json({ success: true, triggered: eventName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
