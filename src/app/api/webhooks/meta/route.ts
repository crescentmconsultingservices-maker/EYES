import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Meta Webhook Verification (Hub verification challenge)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'EYES_META_WEBHOOK_SECRET';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Meta Webhook Real-time Event Receiver
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[Meta Webhook] Realtime Event Received:', JSON.stringify(body, null, 2));

    // Acknowledge receipt immediately to Meta within 200ms
    return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
  } catch (err) {
    console.error('[Meta Webhook Error]:', err);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}
