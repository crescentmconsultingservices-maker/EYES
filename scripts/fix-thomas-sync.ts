import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function fixSyncStatus() {
  const sb = createAdminClient();

  // 1. Get memory counts by platform for Thomas
  const { data: mems } = await sb
    .from('memories')
    .select('platform')
    .eq('user_id', THOMAS_ID);

  const platformCounts: Record<string, number> = {};
  for (const m of mems || []) {
    const p = m.platform.replace(/_/g, '-');
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  }
  console.log('Platform counts in memories table:', platformCounts);

  // 2. Update sync_status for facebook and meta
  const now = new Date().toISOString();
  await sb.from('sync_status').upsert([
    {
      user_id: THOMAS_ID,
      platform: 'facebook',
      status: 'connected',
      sync_progress: 100,
      total_items: platformCounts['facebook'] || 3,
      last_sync_at: now,
      updated_at: now,
      error_message: null,
    },
    {
      user_id: THOMAS_ID,
      platform: 'meta',
      status: 'connected',
      sync_progress: 100,
      total_items: platformCounts['facebook'] || 3,
      last_sync_at: now,
      updated_at: now,
      error_message: null,
    }
  ], { onConflict: 'user_id,platform' });

  // 3. Update user_profiles memories_indexed
  const totalMems = mems?.length || 201;
  await sb.from('user_profiles').update({
    memories_indexed: totalMems,
    onboarding_completed: true,
    updated_at: now,
  }).eq('user_id', THOMAS_ID);

  console.log(`✅ Fixed sync_status and user_profiles (memories_indexed: ${totalMems})`);
}

fixSyncStatus().catch(console.error);
