import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SERVER_URL = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;
const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error('\n❌ Error: Missing user_id');
  console.log('Usage: node scripts/test-leak-scan.mjs <your-user-id>\n');
  process.exit(1);
}

if (!CRON_SECRET) {
  console.error('\n❌ Error: CRON_SECRET not found in .env.local\n');
  process.exit(1);
}

async function runTest() {
  console.log(`\n🚀 Starting Local Leak Scan Test for User: ${USER_ID}\n`);
  let scanId = null;

  try {
    // ---------------------------------------------------------
    // Phase 2: Ingest
    // ---------------------------------------------------------
    console.log('⏳ [Phase 2] Triggering Batch Ingestion...');
    const ingestRes = await fetch(`${SERVER_URL}/api/revenue/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({ user_id: USER_ID, client_stated_fee: 7000 })
    });

    const ingestData = await ingestRes.json();
    if (!ingestRes.ok) throw new Error(`Ingest failed: ${JSON.stringify(ingestData)}`);

    scanId = ingestData.manifest.scan_id;
    console.log(`✅ [Phase 2] Success! Scan ID: ${scanId}`);
    console.log(`   Threads Found: ${ingestData.manifest.threads_found}`);
    console.log(`   Threads Eligible: ${ingestData.manifest.threads_eligible}`);

    if (ingestData.manifest.threads_eligible === 0) {
      console.log('\n⚠️ No eligible threads found. Aborting early.');
      return;
    }

    // ---------------------------------------------------------
    // Phase 3: Detection
    // ---------------------------------------------------------
    console.log('\n⏳ [Phase 3] Triggering LLM Detection Pass...');
    let hasMore = true;
    let totalProcessed = 0;
    let totalLeaks = 0;

    // Loop through batches
    while (hasMore) {
      const detectRes = await fetch(`${SERVER_URL}/api/revenue/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}`
        },
        body: JSON.stringify({ scan_id: scanId })
      });

      const detectData = await detectRes.json();
      if (!detectRes.ok) throw new Error(`Detection failed: ${JSON.stringify(detectData)}`);

      if (detectData.message === 'All threads processed') {
        hasMore = false;
      } else {
        totalProcessed += detectData.processed || 0;
        totalLeaks += detectData.leaks_found || 0;
        hasMore = detectData.has_more || false;
        console.log(`   Processed batch... (Found ${detectData.leaks_found} leaks in this batch)`);
      }
    }
    
    console.log(`✅ [Phase 3] Success! Processed ${totalProcessed} threads. Total Leaks Found: ${totalLeaks}`);

    // ---------------------------------------------------------
    // Phase 4: Aggregation & Report
    // ---------------------------------------------------------
    console.log('\n⏳ [Phase 4] Generating Final Report...');
    const reportRes = await fetch(`${SERVER_URL}/api/revenue/generate-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      body: JSON.stringify({ scan_id: scanId })
    });

    const reportData = await reportRes.json();
    if (!reportRes.ok) {
        // If there were 0 leaks, the API returns a 404 No Leaks Found which is technically expected
        if (reportRes.status === 404) {
             console.log(`\n✅ [Phase 4] Scan completed, but the AI found absolutely zero revenue leaks!`);
             return;
        }
        throw new Error(`Report failed: ${JSON.stringify(reportData)}`);
    }

    console.log(`✅ [Phase 4] Success!`);
    console.log('\n================ REPORT SUMMARY ================');
    console.log(`Total Pipeline Value at Risk: €${reportData.report.summary.total_value_eur}`);
    console.log(`Total Flagged Leaks: ${reportData.report.summary.threads_flagged}`);
    console.log('Breakdown:', reportData.report.summary.counts);
    console.log('================================================\n');
    
    console.log('🎉 End-to-End Test Completed Successfully!');

  } catch (error) {
    console.error('\n❌ Test Pipeline Failed:', error);
  }
}

runTest();
