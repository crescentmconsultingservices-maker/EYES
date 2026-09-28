import { NextRequest, NextResponse } from 'next/server';
import { safeEqual, verifyMetaSignature } from '@/lib/webhooks/verify';

export const dynamic = 'force-dynamic';

// Meta Webhook Verification (Hub verification challenge)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // No hardcoded fallback: if the env var is unset, verification always fails.
  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (VERIFY_TOKEN && mode === 'subscribe' && token && safeEqual(token, VERIFY_TOKEN)) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Meta Webhook Real-time Event Receiver
export async function POST(req: NextRequest) {
  // Signature must be checked against the RAW body, before JSON parsing.
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');

  if (!verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    // Do not log full payloads: they can contain personal data.
    console.log('[Meta Webhook] Event received', { object: body?.object, entries: body?.entry?.length ?? 0 });
    return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
  } catch (err) {
    console.error('[Meta Webhook Error]:', err);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 400 });
  }
}
