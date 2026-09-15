import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function diagnose() {
  const sb = createAdminClient();

  console.log('=== DIAGNOSING THOMAS SHELBY (4d2f...) ===');

  // 1. User Profile
  const { data: profile } = await sb.from('user_profiles').select('*').eq('user_id', THOMAS_ID).single();
  console.log('User Profile:', profile);

  // 2. OAuth Tokens
  const { data: tokens } = await sb.from('oauth_tokens').select('*').eq('user_id', THOMAS_ID);
  console.log('OAuth Tokens:', tokens?.map(t => ({ platform: t.platform, expires_at: t.expires_at, updated_at: t.updated_at })));

  // 3. Sync Status
  const { data: syncs } = await sb.from('sync_status').select('*').eq('user_id', THOMAS_ID);
  console.log('Sync Status:', syncs?.map(s => ({ platform: s.platform, status: s.status, total_items: s.total_items, error: s.error_message })));

  // 4. Memories count and samples
  const { count: memCount } = await sb.from('memories').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID);
  const { data: sampleMems } = await sb.from('memories').select('id, platform, title, is_flagged, timestamp').eq('user_id', THOMAS_ID).limit(5);
  console.log(`Memories count: ${memCount}`);
  console.log('Sample Memories:', sampleMems);

  // 5. Chronic Nodes and Edges
  const { count: nodeCount } = await sb.from('chronic_nodes').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID);
  const { count: edgeCount } = await sb.from('chronic_edges').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID);
  console.log(`Chronic Nodes: ${nodeCount}, Chronic Edges: ${edgeCount}`);

  // 6. Action Queue
  const { count: actionCount } = await sb.from('action_queue').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID);
  console.log(`Action Queue Items: ${actionCount}`);
}

diagnose().catch(console.error);
