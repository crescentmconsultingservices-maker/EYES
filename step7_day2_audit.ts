import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("=============================================");
  console.log("🟢 EYES STEP 7: DAY 2 OBSERVATION AUDIT");
  console.log("=============================================");
  
  // Calculate yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toISOString();
  
  console.log(`Querying active chat threads since: ${yesterdayString}...\n`);
  
  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select('id, summary, updated_at')
    .gte('updated_at', yesterdayString)
    .order('updated_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error("Error fetching threads:", error.message);
    return;
  }
  
  if (threads.length === 0) {
    console.log("No new chat activity found in the last 24 hours.");
    return;
  }
  
  console.log(`Found ${threads.length} recent active threads.`);
  
  for (const t of threads) {
    console.log(`\n--- Thread ID: ${t.id} ---`);
    console.log(`Last Updated: ${new Date(t.updated_at).toLocaleString()}`);
    console.log(`Summary: ${t.summary || 'No summary available.'}`);
  }
  
  console.log("\n✅ Audit Complete. Review the summaries above for any hallucinated commitments.");
}

runAudit();
