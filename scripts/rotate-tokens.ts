/**
 * scripts/rotate-tokens.ts
 *
 * Encryption key rotation utility for EYES.
 *
 * Usage:
 *   npx ts-node scripts/rotate-tokens.ts --dry-run
 *   npx ts-node scripts/rotate-tokens.ts --confirm
 *
 * What it does:
 *   1. Reads all rows in `token_vault` that are encrypted with the OLD key
 *      (identified by key_version < current version)
 *   2. Decrypts each token using the OLD encryption key (ENCRYPTION_KEY_OLD env)
 *   3. Re-encrypts each token using the NEW encryption key (ENCRYPTION_KEY env)
 *   4. Updates the row with the new ciphertext + bumps key_version
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Service role key (needed for vault access)
 *   ENCRYPTION_KEY             - New AES-256-GCM key (hex, 64 chars)
 *   ENCRYPTION_KEY_OLD         - Previous key to decrypt with (hex, 64 chars)
 *   ENCRYPTION_KEY_VERSION     - Integer version number of the NEW key (e.g. 2)
 */

import { createClient } from '@supabase/supabase-js';
import { createDecipheriv, createCipheriv, randomBytes } from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEW_KEY_HEX     = process.env.ENCRYPTION_KEY!;
const OLD_KEY_HEX     = process.env.ENCRYPTION_KEY_OLD!;
const NEW_KEY_VERSION = Number(process.env.ENCRYPTION_KEY_VERSION ?? '2');
const DRY_RUN         = !process.argv.includes('--confirm');
const BATCH_SIZE      = 50;

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

/**
 * Decrypt a ciphertext produced by our AES-256-GCM scheme.
 * Stored format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function decrypt(stored: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = stored.split(':');
  if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid stored token format');
  const decipher = createDecipheriv('aes-256-gcm', hexToBuffer(keyHex), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

/**
 * Encrypt a plaintext using AES-256-GCM.
 * Returns: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encrypt(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', hexToBuffer(keyHex), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !NEW_KEY_HEX || !OLD_KEY_HEX) {
    console.error('❌  Missing required environment variables. See script header.');
    process.exit(1);
  }
  if (NEW_KEY_HEX.length !== 64 || OLD_KEY_HEX.length !== 64) {
    console.error('❌  ENCRYPTION_KEY and ENCRYPTION_KEY_OLD must each be 64 hex chars (32 bytes).');
    process.exit(1);
  }

  console.log(DRY_RUN ? '🔍  DRY RUN — no changes will be written.' : '🔄  LIVE RUN — rows will be updated.');
  console.log(`    Target key version: ${NEW_KEY_VERSION}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let offset = 0;
  let total = 0;
  let errors = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('token_vault')
      .select('id, encrypted_token, key_version')
      .lt('key_version', NEW_KEY_VERSION)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('❌  Supabase query failed:', error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    console.log(`\n📦  Batch [${offset + 1}–${offset + rows.length}]:`);

    for (const row of rows) {
      try {
        const plaintext = decrypt(row.encrypted_token, OLD_KEY_HEX);
        const newCiphertext = encrypt(plaintext, NEW_KEY_HEX);

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('token_vault')
            .update({ encrypted_token: newCiphertext, key_version: NEW_KEY_VERSION })
            .eq('id', row.id);

          if (updateError) throw updateError;
        }
        console.log(`    ✅  ${row.id}  (version ${row.key_version} → ${NEW_KEY_VERSION})${DRY_RUN ? ' [dry]' : ''}`);
        total++;
      } catch (e: any) {
        console.error(`    ❌  ${row.id}: ${e.message}`);
        errors++;
      }
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`\n✅  Done. Rotated: ${total} | Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
