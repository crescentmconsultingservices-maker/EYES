import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

async function main() {
  const sb = createAdminClient();
  const { data: users, error } = await sb.auth.admin.listUsers();
  if (error) {
    console.error('Error listing users:', error);
    return;
  }

  console.log('=== All Supabase Auth Users ===');
  for (const u of users.users) {
    const { count: memCount } = await sb.from('memories').select('*', { count: 'exact', head: true }).eq('user_id', u.id);
    console.log(`User ID: ${u.id}`);
    console.log(`  Email: ${u.email}`);
    console.log(`  Providers: ${u.app_metadata?.providers || u.identities?.map(i => i.provider)}`);
    console.log(`  Last Sign In: ${u.last_sign_in_at}`);
    console.log(`  Memories: ${memCount}`);
  }

  console.log('\n=== Recent OAuth Tokens in DB ===');
  const { data: tokens } = await sb
    .from('oauth_tokens')
    .select('user_id, platform, access_token, updated_at')
    .eq('platform', 'facebook');
  console.log('Saved Facebook tokens in DB:', tokens?.length);
  for (const t of tokens || []) {
    console.log(`User: ${t.user_id}, Updated: ${t.updated_at}`);
    const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${t.access_token}`);
    console.log('Meta /me HTTP Status:', res.status);
    console.log('Meta /me Result:', await res.json());
  }

  console.log('\n=== Recent Sync Status in DB ===');
  const { data: syncs } = await sb
    .from('sync_status')
    .select('user_id, platform, status, last_synced_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
  console.log(syncs);
}

main().catch(console.error);
