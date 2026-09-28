import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processMessageForAcuteAlert } from '../gmail/route';
import { waitUntil } from '@vercel/functions';
import { extractForUser } from '../../actions/extract/route';
import { verifySlackSignature } from '@/lib/webhooks/verify';

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// NOTE: this is the app's *Signing Secret* (Slack app > Basic Information), NOT the client secret.
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * POST /api/webhooks/slack
 * Receives Slack Events API payloads.
 * Handles: url_verification challenge + message.channels events.
 */
export async function POST(request: Request) {
  // Verify the signature against the RAW body before touching the payload.
  const rawBody = await request.text();
  const validSignature = verifySlackSignature(
    rawBody,
    request.headers.get('x-slack-request-timestamp'),
    request.headers.get('x-slack-signature'),
    SLACK_SIGNING_SECRET,
  );
  if (!validSignature) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* handled below */ }
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== 'event_callback') {
    return NextResponse.json({ received: true });
  }

  const event = body.event;
  if (!event || event.type !== 'message' || event.subtype) {
    // Skip edits, deletes, bot messages
    return NextResponse.json({ received: true });
  }

  // Find the user_id from the Slack team_id + user mapping stored in oauth_tokens
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as any;

  const { data } = await supabase
    .from('oauth_tokens')
    .select('user_id')
    .eq('platform', 'slack')
    .eq('metadata->>team_id', String(body.team_id ?? ''))
    .limit(1);

  const tokenRow = data?.[0];

  if (!tokenRow?.user_id) return NextResponse.json({ received: true });

  const userId = tokenRow.user_id;

  // Build a synthetic memory object from the Slack event
  const message = {
    id:        `slack_${event.ts}`,
    content:   event.text ?? '',
    author:    event.user ?? null,
    title:     `Slack message in <#${event.channel}>`,
    timestamp: event.ts ? new Date(parseFloat(event.ts) * 1000).toISOString() : new Date().toISOString(),
  };

  // Run the same acute detection pipeline as Gmail
  await processMessageForAcuteAlert(supabase, userId, message, 'slack').catch((err) => {
    console.error('[Slack Webhook] processMessageForAcuteAlert failed:', err);
  });

  // Trigger Action Queue extraction immediately in the background
  waitUntil(extractForUser(userId, supabase).catch(err => 
    console.error('[Slack Webhook] Background extraction failed:', err)
  ));

  return NextResponse.json({ received: true });
}
