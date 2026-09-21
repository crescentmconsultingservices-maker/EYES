/**
 * src/services/auth/tokens.ts
 *
 * AES-256-GCM token encryption / decryption with key versioning support.
 *
 * Fix 4: TOKEN_ENCRYPTION_KEY rotation.
 *
 * Format:
 *   enc:v1:<iv_b64>:<ciphertext_b64>:<gcm_tag_b64>   ← encrypted with KEY (v1)
 *   enc:v2:<iv_b64>:<ciphertext_b64>:<gcm_tag_b64>   ← encrypted with TOKEN_ENCRYPTION_KEY_V2
 *
 * To rotate keys:
 *   1. Generate a new 32-byte key:  openssl rand -base64 32
 *   2. Set TOKEN_ENCRYPTION_KEY_V2 to the new value in your env/vault
 *   3. Set TOKEN_ENCRYPTION_KEY to the OLD key (so existing tokens can still decrypt)
 *   4. Deploy — new tokens will be encrypted with V2 automatically
 *   5. Run the re-encryption cron job (see scripts/rotate-tokens.ts) to migrate v1 → v2
 *   6. Once all tokens are v2, remove TOKEN_ENCRYPTION_KEY (the old key) entirely
 */
import crypto from 'node:crypto';

// ── Version table ─────────────────────────────────────────────────────────────
// Add new versions here as keys rotate. The active version is written on every
// new encrypt call. Old versions remain decodable until re-encryption is complete.
const ACTIVE_PREFIX = 'enc:v2' as const;

type KeyVersion = 'enc:v1' | 'enc:v2';

const KEY_ENV_MAP: Record<KeyVersion, string> = {
  'enc:v1': 'TOKEN_ENCRYPTION_KEY',
  'enc:v2': 'TOKEN_ENCRYPTION_KEY_V2',
};

// ── Private helpers ───────────────────────────────────────────────────────────
let hasWarnedMissingTokenKey = false;

function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production';
}

function handleMissingOrInvalidTokenKey(operation: 'encrypt' | 'decrypt'): void {
  if (isProductionLike()) {
    throw new Error(`TOKEN_ENCRYPTION_KEY is required to ${operation} OAuth tokens in production.`);
  }
  if (!hasWarnedMissingTokenKey) {
    hasWarnedMissingTokenKey = true;
    console.warn(
      '[Token] TOKEN_ENCRYPTION_KEY is missing or invalid. ' +
      'Falling back to plaintext token handling in non-production mode.',
    );
  }
}

function loadKey(envVar: string): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) return null;
  try {
    const key = Buffer.from(raw.trim(), 'base64');
    if (key.length !== 32) {
      console.error(`[Token] ${envVar} must be exactly 32 bytes when base64-decoded (got ${key.length}).`);
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

/**
 * Returns the key for encrypting NEW tokens.
 * Falls back through v2 → v1 so the system keeps working even if only one key
 * is configured. In production both missing causes a hard throw via encryptToken.
 */
function getActiveKey(): { key: Buffer; prefix: KeyVersion } | null {
  // Prefer the newest key version
  const v2 = loadKey(KEY_ENV_MAP['enc:v2']);
  if (v2) return { key: v2, prefix: 'enc:v2' };

  const v1 = loadKey(KEY_ENV_MAP['enc:v1']);
  if (v1) return { key: v1, prefix: 'enc:v1' };

  return null;
}

/**
 * Resolves the decryption key for a specific version prefix extracted from a
 * stored token. Returns null if the env var for that version is not set.
 */
function getKeyForVersion(prefix: KeyVersion): Buffer | null {
  const envVar = KEY_ENV_MAP[prefix];
  if (!envVar) {
    console.error(`[Token] Unknown key version prefix: ${prefix}`);
    return null;
  }
  return loadKey(envVar);
}

function detectVersion(value: string): KeyVersion | null {
  if (value.startsWith('enc:v2:')) return 'enc:v2';
  if (value.startsWith('enc:v1:')) return 'enc:v1';
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext OAuth token using the active (latest) key version.
 * Returns a versioned ciphertext string safe for storing in the database.
 */
export function encryptToken(value: string): string {
  const active = getActiveKey();
  if (!active) {
    handleMissingOrInvalidTokenKey('encrypt');
    return value; // plaintext fallback in dev
  }

  const { key, prefix } = active;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${prefix}:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

/**
 * Decrypts a stored token. Automatically detects the version prefix and uses
 * the corresponding key, so old v1 tokens remain readable after a key rotation.
 *
 * Returns null on any failure (invalid format, wrong key, tampered ciphertext).
 * Passes through plaintext values (no prefix) for backwards compatibility with
 * tokens stored before encryption was introduced.
 */
export function decryptToken(value: string | null | undefined): string | null {
  if (!value) return null;

  const version = detectVersion(value);

  // No recognised prefix → stored as plaintext (pre-encryption era)
  if (!version) return value;

  const key = getKeyForVersion(version);
  if (!key) {
    handleMissingOrInvalidTokenKey('decrypt');
    throw new Error(
      `TOKEN_ENCRYPTION_KEY for version "${version}" is not set. ` +
      `Set ${KEY_ENV_MAP[version]} in your environment.`,
    );
  }

  // Strip the "enc:v?:" prefix, then split IV : ciphertext : tag
  const withoutPrefix = value.slice(`${version}:`.length);
  const [ivB64, payloadB64, tagB64] = withoutPrefix.split(':');

  if (!ivB64 || !payloadB64 || !tagB64) {
    console.error('[Token] Invalid encrypted token format — missing IV, payload, or tag segments.');
    return null;
  }

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Token] AES-256-GCM decryption error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Returns true if the given stored token was encrypted with an older key version
 * and should be re-encrypted with the current active key during a rotation job.
 */
export function needsReEncryption(value: string | null | undefined): boolean {
  if (!value) return false;
  const version = detectVersion(value);
  if (!version) return false; // plaintext — caller decides
  return version !== ACTIVE_PREFIX;
}
