import { NextResponse } from 'next/server';
import { inngest } from '@/services/inngest/client';

export async function POST(request: Request) {
  const { taskId, approved } = await request.json();

  await inngest.send({
    name: 'iris/investigate.approval',
    data: {
      taskId,
      approved
    },
  });
  
  return NextResponse.json({ success: true });
}
