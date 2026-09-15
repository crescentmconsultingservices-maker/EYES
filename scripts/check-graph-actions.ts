import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const SOURCE_ID = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function checkGraphAndActions() {
  const sb = createAdminClient();

  const [srcEdges, thEdges, srcCorr, thCorr, srcClust, thClust, thActions] = await Promise.all([
    sb.from('chronic_edges').select('*', { count: 'exact', head: true }).eq('user_id', SOURCE_ID),
    sb.from('chronic_edges').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID),
    sb.from('entity_correlations').select('*', { count: 'exact', head: true }).eq('user_id', SOURCE_ID),
    sb.from('entity_correlations').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID),
    sb.from('cognitive_clusters').select('*', { count: 'exact', head: true }).eq('user_id', SOURCE_ID),
    sb.from('cognitive_clusters').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID),
    sb.from('action_queue').select('status', { count: 'exact' }).eq('user_id', THOMAS_ID),
  ]);

  console.log(`Source chronic_edges: ${srcEdges.count}, Thomas: ${thEdges.count}`);
  console.log(`Source entity_correlations: ${srcCorr.count}, Thomas: ${thCorr.count}`);
  console.log(`Source cognitive_clusters: ${srcClust.count}, Thomas: ${thClust.count}`);
  console.log(`Thomas action_queue items: ${thActions.data?.length}`);
  const statusCounts = thActions.data?.reduce((acc: any, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log('Thomas action_queue statuses:', statusCounts);
}

checkGraphAndActions().catch(console.error);
