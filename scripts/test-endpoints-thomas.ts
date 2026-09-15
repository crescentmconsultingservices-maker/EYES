import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function testEndpoints() {
  const sb = createAdminClient();

  // Test what bootstrap returns:
  const userIds = [THOMAS_ID];
  const [oauthTokensResult, syncStatusResult, rawEventsResult, memoriesCountResult] = await Promise.all([
    sb.from('oauth_tokens').select('platform').in('user_id', userIds),
    sb.from('sync_status').select('platform,status,sync_progress,total_items,last_sync_at,error_message').in('user_id', userIds),
    sb.from('memories').select('id, platform, title, content, timestamp, event_type, author, is_flagged, flag_severity, flag_reason').in('user_id', userIds).eq('is_flagged', true).order('timestamp', { ascending: false }).limit(50),
    sb.from('memories').select('id', { count: 'exact', head: true }).in('user_id', userIds),
  ]);

  console.log('--- BOOTSTRAP DATA ---');
  console.log('OAuth rows:', oauthTokensResult.data);
  console.log('Sync rows:', syncStatusResult.data);
  console.log('Total memories count:', memoriesCountResult.count);
  console.log('Flagged rows:', rawEventsResult.data?.length);

  // Test what readiness returns for facebook, gmail, google-calendar:
  const tokenPlatforms = new Set((oauthTokensResult.data || []).map(t => t.platform));
  const syncMap = new Map((syncStatusResult.data || []).map(s => [s.platform, s]));

  for (const pid of ['facebook', 'gmail', 'google-calendar']) {
    const dbId = pid.replace(/-/g, '_');
    const sync = syncMap.get(pid) || syncMap.get(dbId) || (pid === 'facebook' ? syncMap.get('meta') : undefined);
    const hasToken = tokenPlatforms.has(pid) || tokenPlatforms.has(dbId) || (pid === 'facebook' && (tokenPlatforms.has('facebook') || tokenPlatforms.has('meta')));
    console.log(`Platform [${pid}]: hasToken=${hasToken}, syncStatus=${sync?.status}, totalItems=${sync?.total_items}`);
  }
}

testEndpoints().catch(console.error);
