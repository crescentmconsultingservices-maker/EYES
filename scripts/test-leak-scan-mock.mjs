import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SERVER_URL = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;
const USER_ID = process.argv[2];

if (!USER_ID || !CRON_SECRET) {
  console.error('\n❌ Error: Missing user_id or CRON_SECRET');
  console.log('Usage: node scripts/test-leak-scan-mock.mjs <your-user-id>\n');
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMockTest() {
  console.log(`\n🚀 Starting MOCK Leak Scan Test for User: ${USER_ID}\n`);

  try {
    // 1. Create a Scan Namespace manually
    const { data: scanData } = await supabase
      .from('leak_scans')
      .insert({ user_id: USER_ID, client_stated_fee: 7000, status: 'processing' })
      .select('scan_id')
      .single();
    
    const scanId = scanData.scan_id;
    console.log(`✅ [Phase 2 - Mock] Created Scan ID: ${scanId}`);

    // 2. Inject a fake "GHOSTED_CLIENT" and "DROPPED_COMMITMENT" thread directly into the DB
    const mockThreads = [
      {
        scan_id: scanId,
        thread_id: 'mock_thread_1',
        evidence: {
          _raw_transcript: [
            { message_id: 'm1', from: 'client@acme.com', timestamp: new Date(Date.now() - 15*86400000).toISOString(), direction: 'inbound', content: 'We love the proposal! When can you start?' },
            { message_id: 'm2', from: 'you@yourdomain.com', timestamp: new Date(Date.now() - 14*86400000).toISOString(), direction: 'outbound', content: 'Great to hear! I will send over the final contract by Friday so we can kick off.' }
            // Note: 14 days ago, no follow up = DROPPED COMMITMENT
          ]
        }
      },
      {
        scan_id: scanId,
        thread_id: 'mock_thread_2',
        evidence: {
          _raw_transcript: [
            { message_id: 'm3', from: 'lead@startup.io', timestamp: new Date(Date.now() - 20*86400000).toISOString(), direction: 'inbound', content: 'Hey there, we are looking to hire a senior engineer. Are you taking on new clients?' }
            // Note: 20 days ago, no outbound reply = UNANSWERED INBOUND
          ]
        }
      }
    ];

    await supabase.from('leak_scan_threads').insert(mockThreads);
    console.log(`✅ [Phase 2 - Mock] Injected 2 fake email threads into the database.`);

    // ---------------------------------------------------------
    // Phase 3: Detection
    // ---------------------------------------------------------
    console.log('\n⏳ [Phase 3] Triggering LLM Detection Pass (Connecting to Claude)...');
    let hasMore = true;
    let totalLeaks = 0;

    while (hasMore) {
      const detectRes = await fetch(`${SERVER_URL}/api/revenue/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CRON_SECRET}` },
        body: JSON.stringify({ scan_id: scanId })
      });
      const detectData = await detectRes.json();
      if (!detectRes.ok) throw new Error(`Detection failed: ${JSON.stringify(detectData)}`);

      if (detectData.message === 'All threads processed') {
        hasMore = false;
      } else {
        if (detectData.debug_errors && detectData.debug_errors.length > 0) {
            console.log('DEBUG ERRORS:', JSON.stringify(detectData.debug_errors, null, 2));
        }
        totalLeaks += detectData.leaks_found || 0;
        hasMore = detectData.has_more || false;
      }
    }
    console.log(`✅ [Phase 3] Success! The AI analyzed the threads and found ${totalLeaks} leaks.`);

    // ---------------------------------------------------------
    // Phase 4: Aggregation & Report
    // ---------------------------------------------------------
    console.log('\n⏳ [Phase 4] Generating Final Report...');
    const reportRes = await fetch(`${SERVER_URL}/api/revenue/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CRON_SECRET}` },
      body: JSON.stringify({ scan_id: scanId })
    });

    const reportData = await reportRes.json();
    if (!reportRes.ok) throw new Error(`Report failed: ${JSON.stringify(reportData)}`);

    console.log(`✅ [Phase 4] Success!`);
    console.log('\n================ REPORT SUMMARY ================');
    console.log(`Total Pipeline Value at Risk: €${reportData.report.summary.total_value_eur}`);
    console.log(`Total Flagged Leaks: ${reportData.report.summary.threads_flagged}`);
    console.log('Breakdown:', reportData.report.summary.counts);
    console.log('================================================\n');

  } catch (error) {
    console.error('\n❌ Test Pipeline Failed:', error);
  }
}

runMockTest();
