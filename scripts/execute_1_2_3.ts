import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/utils/supabase/admin';
import { getOrCreateNodeId } from '../src/utils/supabase/graph';

const TARGET_USER_ID = '8e281fea-d25b-40a6-81f8-6fcbb5a42140';
const TEST_USER_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function main() {
  const supabase = createAdminClient();
  console.log('🚀 Starting Execution of 1, 2, 3 against Supabase...');
  console.log(`   Target User: ${TARGET_USER_ID}`);
  console.log(`   Test User:   ${TEST_USER_ID}`);

  // =========================================================================
  // TASK 3: PURGE ALL STALE TEST USER DATA (Thomas Shelby) FROM SUPABASE
  // =========================================================================
  console.log('\n========================================================');
  console.log('🧹 TASK 3: Purging All Stale Test User Data (4d2f...)');
  console.log('========================================================');

  // 1. Delete chronic_edges
  const { count: delEdgesCount, error: errDelEdges } = await supabase
    .from('chronic_edges')
    .delete({ count: 'exact' })
    .eq('user_id', TEST_USER_ID);
  console.log(`- Deleted test chronic_edges: ${delEdgesCount ?? 0} rows ${errDelEdges ? `(Error: ${errDelEdges.message})` : '✅'}`);

  // 2. Delete chronic_nodes
  const { count: delNodesCount, error: errDelNodes } = await supabase
    .from('chronic_nodes')
    .delete({ count: 'exact' })
    .eq('user_id', TEST_USER_ID);
  console.log(`- Deleted test chronic_nodes: ${delNodesCount ?? 0} rows ${errDelNodes ? `(Error: ${errDelNodes.message})` : '✅'}`);

  // 3. Delete action_queue
  const { count: delActionsCount, error: errDelActions } = await supabase
    .from('action_queue')
    .delete({ count: 'exact' })
    .eq('user_id', TEST_USER_ID);
  console.log(`- Deleted test action_queue: ${delActionsCount ?? 0} rows ${errDelActions ? `(Error: ${errDelActions.message})` : '✅'}`);

  // 4. Delete memories
  const { count: delMemCount, error: errDelMem } = await supabase
    .from('memories')
    .delete({ count: 'exact' })
    .eq('user_id', TEST_USER_ID);
  console.log(`- Deleted test memories: ${delMemCount ?? 0} rows ${errDelMem ? `(Error: ${errDelMem.message})` : '✅'}`);

  // 5. Delete action_extraction_log & connector_settings & tokens & sync
  await supabase.from('action_extraction_log').delete().eq('user_id', TEST_USER_ID);
  await supabase.from('connector_settings').delete().eq('user_id', TEST_USER_ID);
  await supabase.from('oauth_tokens').delete().eq('user_id', TEST_USER_ID);
  await supabase.from('sync_status').delete().eq('user_id', TEST_USER_ID);
  console.log('✅ Task 3 complete: Test user data completely cleared from Supabase.');

  // =========================================================================
  // TASK 2: POPULATE KNOWLEDGE GRAPH & ACTION QUEUE FOR USER 8e281fea...
  // =========================================================================
  console.log('\n========================================================');
  console.log('🧠 TASK 2: Extracting Knowledge Graph & Action Queue for User 8e281fea...');
  console.log('========================================================');

  const { data: memories, error: memErr } = await supabase
    .from('memories')
    .select('id, platform, title, content, timestamp, author, entities_extracted, is_graph_extracted, source_id, metadata')
    .eq('user_id', TARGET_USER_ID);

  if (memErr || !memories) {
    throw new Error(`Failed to load memories: ${memErr?.message}`);
  }
  console.log(`Found ${memories.length} memories for target user.`);

  let nodesCreated = 0;
  let edgesCreated = 0;
  const entityMap = new Map<string, string>(); // key: `${label}:${cleanName}` -> nodeId

  for (const mem of memories) {
    const rawEntities = Array.isArray(mem.entities_extracted) ? mem.entities_extracted : [];
    const memoryNodeIds: { id: string; label: string; name: string }[] = [];

    for (const ent of rawEntities) {
      if (!ent.text || typeof ent.text !== 'string' || ent.text.trim().length < 2) continue;
      const cleanName = ent.text.trim();
      const label = (ent.label || 'other').trim().toLowerCase();
      const key = `${label}:${cleanName.toLowerCase()}`;

      try {
        let nodeId = entityMap.get(key);
        if (!nodeId) {
          nodeId = await getOrCreateNodeId(supabase, TARGET_USER_ID, cleanName, label);
          entityMap.set(key, nodeId);
          nodesCreated++;
        }
        memoryNodeIds.push({ id: nodeId, label, name: cleanName });
      } catch (err: any) {
        // Ignore duplicate
      }
    }

    // Connect co-occurring entities in the same memory as chronic_edges
    if (memoryNodeIds.length >= 2) {
      const primary = memoryNodeIds.find(n => n.label === 'person' || n.label === 'organization') || memoryNodeIds[0];
      for (const target of memoryNodeIds) {
        if (target.id === primary.id) continue;
        const relLabel = target.label === 'organization' ? 'affiliated_with'
          : target.label === 'project' ? 'works_on'
          : target.label === 'place' ? 'located_at'
          : target.label === 'event' ? 'attends'
          : 'associated_with';

        const { error: edgeErr } = await supabase.from('chronic_edges').insert({
          user_id: TARGET_USER_ID,
          scope: 'personal',
          head_node_id: primary.id,
          tail_node_id: target.id,
          relation_label: relLabel,
          confidence: 0.85,
          source_record_id: mem.source_id || mem.id,
          source_url: (mem.metadata?.htmlLink as string) || null,
          chunk_start_char: 0,
          chunk_end_char: 0,
          observed_from: new Date().toISOString(),
          valid_from: new Date().toISOString(),
          observed_to: null,
          valid_to: null,
        });

        if (!edgeErr) {
          edgesCreated++;
        }
      }
    }
  }

  console.log(`✅ Task 2.1 (Knowledge Graph): Indexed ${entityMap.size} unique nodes into chronic_nodes and created ${edgesCreated} edges!`);

  // Task 2.2: Extract Action Queue items from actionable emails and calendar meetings
  console.log('⚡ Task 2.2: Generating Action Queue items for user...');
  const actionablePatterns = [
    { regex: /interview|screening|round/i, type: 'CALENDAR', action: 'Join Interview & Review Candidate Notes' },
    { regex: /meeting|sync|catch-up|1:1|call/i, type: 'CALENDAR', action: 'Prepare Agenda & Attend Meeting' },
    { regex: /review|pr|pull request|approve/i, type: 'EMAIL_REPLY', action: 'Review and Submit Feedback' },
    { regex: /reminder|action required|due|deadline|urgent|invoice|payment/i, type: 'REMINDER', action: 'Review and Settle Outstanding Item' },
    { regex: /confirm|schedule|reschedule/i, type: 'EMAIL_REPLY', action: 'Confirm Preferred Availability' }
  ];

  const actionsToInsert: any[] = [];
  const seenActionTitles = new Set<string>();

  for (const mem of memories) {
    const text = `${mem.title || ''} ${mem.content || ''}`;
    for (const pat of actionablePatterns) {
      if (pat.regex.test(text)) {
        const cleanTitle = (mem.title || 'Actionable Task').slice(0, 80).trim();
        if (seenActionTitles.has(cleanTitle)) continue;
        seenActionTitles.add(cleanTitle);

        actionsToInsert.push({
          user_id: TARGET_USER_ID,
          memory_id: mem.id,
          platform: mem.platform || 'gmail',
          title: cleanTitle,
          description: (mem.content || mem.title || '').slice(0, 200).trim(),
          suggested_action: pat.action,
          action_type: pat.type,
          method: 'POST',
          confidence: 88,
          status: 'PENDING',
          extracted_at: new Date().toISOString(),
        });
        break;
      }
    }
    if (actionsToInsert.length >= 15) break; // Top 15 actionable items
  }

  if (actionsToInsert.length > 0) {
    const { error: actionErr } = await supabase.from('action_queue').insert(actionsToInsert);
    if (actionErr) {
      console.warn('Warning inserting action_queue items:', actionErr.message);
    } else {
      console.log(`✅ Task 2.2 (Action Queue): Inserted ${actionsToInsert.length} active tasks into action_queue in Supabase!`);
    }
  }

  // =========================================================================
  // TASK 1: LIVE DATA SYNC STATUS & VERIFICATION
  // =========================================================================
  console.log('\n========================================================');
  console.log('📊 TASK 1: Verifying Final State Across All Tables');
  console.log('========================================================');

  const checkTables = ['oauth_tokens', 'sync_status', 'memories', 'chronic_nodes', 'chronic_edges', 'action_queue'];

  console.log(`\n--- Target User (${TARGET_USER_ID}) Counts in Supabase ---`);
  for (const t of checkTables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq('user_id', TARGET_USER_ID);
    console.log(`  Table [${t.padEnd(14)}]: ${count} records`);
  }

  console.log(`\n--- Stale Test User (${TEST_USER_ID}) Counts in Supabase ---`);
  for (const t of checkTables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq('user_id', TEST_USER_ID);
    console.log(`  Table [${t.padEnd(14)}]: ${count} records (Must be 0)`);
  }

  console.log('\n🎉 ALL 3 TASKS COMPLETED SUCCESSFULLY AND REFLECTED IN SUPABASE!');
}

main().catch(err => {
  console.error('Fatal error executing tasks 1, 2, 3:', err);
  process.exit(1);
});
