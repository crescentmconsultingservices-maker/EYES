import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

async function check() {
  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.listUsers();
  if (error) {
    console.error('Error listing users:', error);
    return;
  }
  console.log('Total auth users in Supabase:', data.users.length);
  for (const u of data.users) {
    console.log(`User: ${u.id} | Email: ${u.email} | Providers: ${JSON.stringify(u.app_metadata.providers || u.app_metadata.provider)} | Last sign in: ${u.last_sign_in_at}`);
  }
}

check().catch(console.error);
