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
 *   1. Reads all rows in `oauth_tokens` that are encrypted with the OLD key (enc:v1)
 *   2. Decrypts each token using the OLD encryption key (TOKEN_ENCRYPTION_KEY env)
 *   3. Re-encrypts each token using the NEW encryption key (TOKEN_ENCRYPTION_KEY_V2 env)
 *   4. Updates the row with the new ciphertext
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Service role key
 *   TOKEN_ENCRYPTION_KEY       - Old key, base64 (for decrypting enc:v1)
 *   TOKEN_ENCRYPTION_KEY_V2    - New key, base64 (for encrypting enc:v2)
 */

import { createClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from '../src/services/auth/tokens';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN         = !process.argv.includes('--confirm');
const BATCH_SIZE      = 50;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Missing Supabase environment variables.');
    process.exit(1);
  }

  // tokens.ts automatically checks for TOKEN_ENCRYPTION_KEY and TOKEN_ENCRYPTION_KEY_V2

  console.log(DRY_RUN ? '🔍  DRY RUN — no changes will be written.' : '🔄  LIVE RUN — rows will be updated.');

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let lastId = '00000000-0000-0000-0000-000000000000'; // Keyset pagination
  let total = 0;
  let errors = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('oauth_tokens')
      .select('id, access_token, refresh_token')
      .like('access_token', 'enc:v1:%') // Only fetch v1 tokens
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌  Supabase query failed:', error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    console.log(`\n📦  Processing batch of ${rows.length} rows...`);

    for (const row of rows) {
      try {
        const plainAccess = decryptToken(row.access_token);
        if (!plainAccess) throw new Error('Failed to decrypt access_token');
        const newAccess = encryptToken(plainAccess);
        
        let newRefresh = row.refresh_token;
        if (row.refresh_token && row.refresh_token.startsWith('enc:v1:')) {
          const plainRefresh = decryptToken(row.refresh_token);
          if (plainRefresh) {
            newRefresh = encryptToken(plainRefresh);
          }
        }

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('oauth_tokens')
            .update({ 
              access_token: newAccess, 
              refresh_token: newRefresh,
              updated_at: new Date().toISOString()
            })
            .eq('id', row.id);

          if (updateError) throw updateError;
        }
        console.log(`    ✅  ${row.id}  (v1 → v2)${DRY_RUN ? ' [dry]' : ''}`);
        total++;
      } catch (e: any) {
        console.error(`    ❌  ${row.id}: ${e.message}`);
        errors++;
      }
      lastId = row.id;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`\n✅  Done. Rotated: ${total} | Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
