import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testChronicLayer() {
  console.log('🔍 Testing Chronic Layer (Knowledge Graph & Insights)...\n');
  
  // 1. Get a valid user
  const { data: users } = await supabase.from('memories').select('user_id').limit(1);
  if (!users || users.length === 0) {
    console.log('❌ No users found with memories.');
    return;
  }
  const userId = users[0].user_id;
  console.log(`👤 Testing for User ID: ${userId}\n`);

  // 2. Fetch Chronic Edges (The Core Knowledge Graph)
  console.log('--- 🧠 CORE KNOWLEDGE GRAPH (CHRONIC EDGES) ---');
  const { data: edges, error: edgesErr } = await supabase.from('chronic_edges')
    .select('head_node_id, relation_label, tail_node_id')
    .eq('user_id', userId)
    .limit(10);
    
  if (edgesErr) {
    console.log('Error fetching edges:', edgesErr.message);
  } else if (edges && edges.length > 0) {
    edges.forEach(edge => {
      console.log(`[${edge.head_node_id}] --(${edge.relation_label})--> [${edge.tail_node_id}]`);
    });
  } else {
    console.log('No active edges found. The extraction engine might not have processed records yet.');
  }

  // 3. Fetch Detected Loops
  console.log('\n--- 🔄 DETECTED BEHAVIORAL LOOPS ---');
  const { data: loops, error: loopsErr } = await supabase.from('detected_loops')
    .select('loop_description, occurrence_count')
    .eq('user_id', userId)
    .limit(3);
    
  if (loopsErr) {
    console.log('Error fetching loops:', loopsErr.message || 'Table might not exist yet');
  } else if (loops && loops.length > 0) {
    loops.forEach(loop => console.log(`- ${loop.loop_description} (${loop.occurrence_count} times)`));
  } else {
    console.log('No loops detected yet.');
  }

  // 4. Fetch Insights (Identity, Narrative, Contradictions)
  console.log('\n--- 👁️ DEEP INSIGHTS (PHASE 5) ---');
  const { data: insights, error: insightsErr } = await supabase.from('insights')
    .select('kind, title, body')
    .eq('user_id', userId)
    .limit(5);
    
  if (insightsErr) {
    console.log('Error fetching insights:', insightsErr.message);
  } else if (insights && insights.length > 0) {
    insights.forEach(insight => {
      console.log(`\n[${insight.kind.toUpperCase()}] ${insight.title}`);
      console.log(insight.body);
    });
  } else {
    console.log('No insights found.');
  }
}

testChronicLayer();
