import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const userId = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
  console.log('Inspecting Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Inspecting target userId:', userId);

  const tables = ['oauth_tokens', 'sync_status', 'memories', 'chronic_nodes', 'chronic_edges', 'action_queue'];
  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      console.log(`Table ${table}: ERROR ->`, error.message);
    } else {
      console.log(`Table ${table}: COUNT = ${count}`);
    }
  }

  const { data: userTokens } = await supabase
    .from('oauth_tokens')
    .select('provider, updated_at')
    .eq('user_id', userId);
  console.log('User oauth_tokens providers:', userTokens?.map(t => t.provider));

  const { data: userSync } = await supabase
    .from('sync_status')
    .select('provider, status, last_synced_at, error')
    .eq('user_id', userId);
  console.log('User sync_status:', userSync);

  // Check memories entities_extracted
  const { data: memWithEntities, count: entCount } = await supabase
    .from('memories')
    .select('id, platform, title, entities_extracted, is_graph_extracted', { count: 'exact' })
    .eq('user_id', userId)
    .not('entities_extracted', 'is', null);

  const { data: sampleAction } = await supabase
    .from('action_queue')
    .select('*')
    .limit(1);
  console.log('Sample action_queue columns:', sampleAction ? Object.keys(sampleAction[0]) : null);
}

main().catch(console.error);
