/**
 * src/lib/webhooks/verify.ts
 *
 * Inbound webhook authentication helpers. Every webhook route must call the
 * matching verifier BEFORE parsing or acting on the payload.
 *
 *  - Gmail   -> Google Pub/Sub push OIDC token (Authorization: Bearer <jwt>)
 *  - Slack   -> X-Slack-Signature / X-Slack-Request-Timestamp (HMAC-SHA256)
 *  - Meta    -> X-Hub-Signature-256 (HMAC-SHA256 of the raw body)
 */
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Slack request signing. `rawBody` must be the exact bytes Slack sent. */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Replay protection: reject anything older/newer than 5 minutes.
  if (Math.abs(nowMs / 1000 - ts) > 60 * 5) return false;
  const expected = `v0=${hmacHex(signingSecret, `v0:${timestamp}:${rawBody}`)}`;
  return safeEqual(expected, signature);
}

/** Meta (Facebook/Instagram) webhook signing. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = `sha256=${hmacHex(appSecret, rawBody)}`;
  return safeEqual(expected, header);
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Google Pub/Sub push authentication.
 * Configure the push subscription with:
 *   --push-auth-service-account=<GMAIL_PUSH_SERVICE_ACCOUNT>
 *   --push-auth-token-audience=<GMAIL_PUSH_AUDIENCE>
 */
export async function verifyPubSubPush(request: Request): Promise<boolean> {
  const auth = request.headers.get('authorization');
  const audience = process.env.GMAIL_PUSH_AUDIENCE;
  const expectedEmail = process.env.GMAIL_PUSH_SERVICE_ACCOUNT;
  if (!auth?.startsWith('Bearer ') || !audience || !expectedEmail) return false;
  try {
    const { payload } = await jwtVerify(auth.slice('Bearer '.length), GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    return payload.email === expectedEmail && payload.email_verified === true;
  } catch {
    return false;
  }
}
