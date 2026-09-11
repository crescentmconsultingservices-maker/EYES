import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';
import { executeMetaSync } from '../src/services/sync/meta-service';
import { SyncActor } from '../src/utils/sync/actor';

async function main() {
  const sb = createAdminClient();
  const targetUserId = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
  const testUserId = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

  // 1. Get the Facebook token from test user
  const { data: fbToken } = await sb
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', testUserId)
    .eq('platform', 'facebook')
    .maybeSingle();

  if (fbToken) {
    console.log('Found Facebook token for test user. Copying to target user (8e281fea...)...');
    await sb.from('oauth_tokens').upsert({
      user_id: targetUserId,
      platform: 'facebook',
      access_token: fbToken.access_token,
      refresh_token: fbToken.refresh_token,
      expires_at: fbToken.expires_at,
      scope: fbToken.scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });
    console.log('✅ Facebook token copied to target user!');
  }

  // 2. Trigger Meta Sync for target user
  console.log('\n--- Syncing Meta for Target User (8e281fea...) ---');
  const targetActor: SyncActor = {
    supabase: sb,
    userId: targetUserId,
    userEmail: 'crescentmconsultingservices@gmail.com',
    userName: 'CrescentM',
    mode: 'cron',
  };

  const targetResult = await executeMetaSync(targetActor, 'backfill');
  console.log('Target User Meta Sync Result:', targetResult);

  // 3. Check memories for facebook platform
  const { data: fbMemories, count } = await sb
    .from('memories')
    .select('id, title, platform, content', { count: 'exact' })
    .eq('user_id', targetUserId)
    .eq('platform', 'facebook');
  console.log(`Target User Facebook Memories in Supabase: ${count}`, fbMemories);
}

main().catch(console.error);
