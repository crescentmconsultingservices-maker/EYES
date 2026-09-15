import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';
import { executeMetaSync } from '../src/services/sync/meta-service';
import { SyncActor } from '../src/utils/sync/actor';

async function testThomas() {
  const sb = createAdminClient();
  const userId = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

  console.log('Testing Thomas Shelby (4d2f...) Lively...');

  // 1. Check tokens
  const { data: tokens } = await sb
    .from('oauth_tokens')
    .select('platform, updated_at')
    .eq('user_id', userId);
  console.log('Tokens in DB:', tokens);

  // 2. Run Meta Sync
  const actor: SyncActor = {
    supabase: sb,
    userId,
    userEmail: 'thomasshelby251890@gmail.com',
    userName: 'Thomas Shelby',
    mode: 'cron',
  };

  console.log('Executing executeMetaSync...');
  const res = await executeMetaSync(actor, 'backfill');
  console.log('Sync Result:', res);

  // 3. Check memories
  const { data: mems, count: memCount } = await sb
    .from('memories')
    .select('id, title, platform, content', { count: 'exact' })
    .eq('user_id', userId);
  console.log(`Memories in DB for Thomas Shelby: ${memCount}`, mems);
}

testThomas().catch(console.error);
