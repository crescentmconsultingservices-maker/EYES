import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';

const SOURCE_ID = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
const THOMAS_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function cloneEdges() {
  const sb = createAdminClient();
  console.log('Mapping chronic nodes between source and Thomas...');

  // 1. Fetch source nodes
  const { data: sourceNodes } = await sb
    .from('chronic_nodes')
    .select('id, name, label')
    .eq('user_id', SOURCE_ID);

  // 2. Fetch Thomas nodes
  const { data: thomasNodes } = await sb
    .from('chronic_nodes')
    .select('id, name, label')
    .eq('user_id', THOMAS_ID);

  console.log(`Found ${sourceNodes?.length} source nodes and ${thomasNodes?.length} Thomas nodes.`);

  // Map: `${label}:::${name}` -> thomasNodeId
  const thomasNodeLookup = new Map<string, string>();
  for (const n of thomasNodes || []) {
    thomasNodeLookup.set(`${n.label}:::${n.name}`, n.id);
  }

  // SourceId -> Key
  const sourceNodeKey = new Map<string, string>();
  for (const n of sourceNodes || []) {
    sourceNodeKey.set(n.id, `${n.label}:::${n.name}`);
  }

  // 3. Fetch source edges
  const { data: sourceEdges } = await sb
    .from('chronic_edges')
    .select('*')
    .eq('user_id', SOURCE_ID);

  console.log(`Found ${sourceEdges?.length} source edges.`);

  const edgesToInsert: any[] = [];
  for (const e of sourceEdges || []) {
    const headKey = sourceNodeKey.get(e.head_node_id);
    const tailKey = sourceNodeKey.get(e.tail_node_id);

    if (headKey && tailKey) {
      const thomasHeadId = thomasNodeLookup.get(headKey);
      const thomasTailId = thomasNodeLookup.get(tailKey);

      if (thomasHeadId && thomasTailId) {
        const { id, created_at, ...rest } = e;
        edgesToInsert.push({
          ...rest,
          user_id: THOMAS_ID,
          head_node_id: thomasHeadId,
          tail_node_id: thomasTailId,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  console.log(`Ready to insert ${edgesToInsert.length} mapped chronic_edges for Thomas Shelby!`);

  // Insert in chunks of 50
  for (let i = 0; i < edgesToInsert.length; i += 50) {
    const chunk = edgesToInsert.slice(i, i + 50);
    const { error } = await sb.from('chronic_edges').insert(chunk);
    if (error) console.warn('Chunk error:', error.message);
  }

  const { count } = await sb.from('chronic_edges').select('*', { count: 'exact', head: true }).eq('user_id', THOMAS_ID);
  console.log(`✅ Thomas Shelby chronic_edges count: ${count}`);

  // Also fix action_queue statuses to lowercase 'pending'
  const { error: aqError } = await sb
    .from('action_queue')
    .update({ status: 'pending' })
    .eq('user_id', THOMAS_ID)
    .eq('status', 'PENDING');
  console.log('Updated action_queue statuses to lowercase "pending", error:', aqError);

  // Check action_queue pending count
  const { count: pendingCount } = await sb
    .from('action_queue')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', THOMAS_ID)
    .eq('status', 'pending');
  console.log(`✅ Thomas Shelby pending action_queue count: ${pendingCount}`);
}

cloneEdges().catch(console.error);
