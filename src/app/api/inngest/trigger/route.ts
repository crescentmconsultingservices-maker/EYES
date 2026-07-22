import { NextResponse } from 'next/server';
import { inngest } from '@/services/inngest/client';

export async function POST() {
  await inngest.send({
    name: 'iris/investigate.churn',
    data: {
      taskId: 'task_123'
    },
  });
  
  return NextResponse.json({ success: true });
}
