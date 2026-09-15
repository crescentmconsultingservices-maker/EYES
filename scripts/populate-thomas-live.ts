import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const SOURCE_USER_ID = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
const THOMAS_USER_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function populateThomas() {
  const sb = createAdminClient();
  console.log('🚀 Populating Thomas Shelby account lively in Supabase...');

  // 1. Ensure user_profile has onboarding_completed = true
  const { data: profile } = await sb
    .from('user_profiles')
    .select('*')
    .eq('user_id', THOMAS_USER_ID)
    .maybeSingle();

  if (!profile) {
    await sb.from('user_profiles').insert({
      user_id: THOMAS_USER_ID,
      email: 'thomasshelby251890@gmail.com',
      display_name: 'Thomas Shelby',
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log('Created user_profile for Thomas Shelby with onboarding_completed = true');
  } else if (!profile.onboarding_completed) {
    await sb.from('user_profiles').update({ onboarding_completed: true }).eq('user_id', THOMAS_USER_ID);
    console.log('Updated Thomas Shelby onboarding_completed = true');
  }

  // 2. Clone memories from source user
  const { data: sourceMems } = await sb
    .from('memories')
    .select('*')
    .eq('user_id', SOURCE_USER_ID);

  console.log(`Fetched ${sourceMems?.length || 0} memories from source user...`);

  if (sourceMems && sourceMems.length > 0) {
    const memsToInsert = sourceMems.map(m => {
      const { id, fts, ...rest } = m;
      return {
        ...rest,
        user_id: THOMAS_USER_ID,
      };
    });

    // Batch insert in chunks of 50
    for (let i = 0; i < memsToInsert.length; i += 50) {
      const chunk = memsToInsert.slice(i, i + 50);
      const { error } = await sb.from('memories').insert(chunk);
      if (error) console.warn('Chunk error memories:', error.message);
    }
    console.log('✅ Inserted memories for Thomas Shelby!');
  }

  // 3. Clone chronic_nodes
  const { data: sourceNodes } = await sb
    .from('chronic_nodes')
    .select('name, label, attributes, scope')
    .eq('user_id', SOURCE_USER_ID);

  if (sourceNodes && sourceNodes.length > 0) {
    const nodesToInsert = sourceNodes.map(n => ({
      ...n,
      user_id: THOMAS_USER_ID,
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < nodesToInsert.length; i += 50) {
      const chunk = nodesToInsert.slice(i, i + 50);
      await sb.from('chronic_nodes').upsert(chunk, { onConflict: 'user_id,label,name' });
    }
    console.log(`✅ Upserted ${sourceNodes.length} chronic_nodes for Thomas Shelby!`);
  }

  // 4. Clone action_queue
  const { data: sourceActions } = await sb
    .from('action_queue')
    .select('*')
    .eq('user_id', SOURCE_USER_ID);

  if (sourceActions && sourceActions.length > 0) {
    const actionsToInsert = sourceActions.map(a => {
      const { id, ...rest } = a;
      return {
        ...rest,
        user_id: THOMAS_USER_ID,
      };
    });
    await sb.from('action_queue').insert(actionsToInsert);
    console.log(`✅ Inserted ${sourceActions.length} action_queue items for Thomas Shelby!`);
  }

  // 5. Setup sync_status and oauth_tokens for Facebook and connected platforms
  await sb.from('sync_status').upsert([
    {
      user_id: THOMAS_USER_ID,
      platform: 'facebook',
      status: 'idle',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      user_id: THOMAS_USER_ID,
      platform: 'gmail',
      status: 'idle',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      user_id: THOMAS_USER_ID,
      platform: 'google-calendar',
      status: 'idle',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ], { onConflict: 'user_id,platform' });

  // 6. Verify final state
  console.log('\n--- Final Verification for Thomas Shelby (4d2f...) ---');
  for (const t of ['oauth_tokens', 'sync_status', 'memories', 'chronic_nodes', 'action_queue']) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_USER_ID);
    console.log(`Table ${t.padEnd(14)}: ${count} records`);
  }
}

populateThomas().catch(console.error);
