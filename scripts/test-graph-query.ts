import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function testGraphQuery() {
  const adminClient = createAdminClient();

  const [edgesRes, corrRes, clustersRes] = await Promise.all([
    adminClient
      .from('chronic_edges')
      .select(`
        id, 
        relation_label, 
        confidence,
        head:head_node_id(id, name),
        tail:tail_node_id(id, name)
      `)
      .in('user_id', [THOMAS_ID])
      .is('valid_to', null)
      .limit(150),
    adminClient
      .from('entity_correlations')
      .select('entity_id, entity_name')
      .in('user_id', [THOMAS_ID]),
    adminClient
      .from('cognitive_clusters')
      .select('id, cluster_label, cluster_description, characteristics, occurrence_count')
      .in('user_id', [THOMAS_ID])
      .eq('is_current', true)
  ]);

  console.log('Edges query result count:', edgesRes.data?.length, 'error:', edgesRes.error);
  if (edgesRes.data && edgesRes.data.length > 0) {
    console.log('First edge sample:', edgesRes.data[0]);
  }
}

testGraphQuery().catch(console.error);
