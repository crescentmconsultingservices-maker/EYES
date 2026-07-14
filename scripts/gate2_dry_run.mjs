import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_URL = 'http://127.0.0.1:8000/extract';

async function runGate2() {
  console.log('--- GATE 2: INSTRUMENTED DRY RUN ---');
  
  const frozenPath = path.join(__dirname, '../artifacts/ground_truth_dataset_frozen.json');
  if (!fs.existsSync(frozenPath)) {
    console.error('[ERROR] Frozen dataset not found at ' + frozenPath);
    return;
  }
  
  const frozenData = JSON.parse(fs.readFileSync(frozenPath, 'utf-8'));
  const records = frozenData.records || frozenData;
  console.log(`Loaded ${records.length} records from Frozen Truth.`);
  
  let passedCandidateFilter = 0;
  let totalRelations = 0;
  let userAttributed = 0;
  let thirdPartyAttributed = 0;
  
  const typeCounts = {};
  const filterKeywords = [/I will/i, /decided/i, /delayed/i, /promise/i, /waiting/i, /scrap/i, /drop/i, /postpone/i, /cancel/i, /commit/i];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const text = record.content || '';
    
    const passed = filterKeywords.some(kw => kw.test(text));
    if (passed) passedCandidateFilter++;

    try {
      const response = await fetch(ENGINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: record.user_id || '99999999-9999-9999-9999-999999999999',
          platform_id: 'gmail',
          text: text.slice(0, 1000),
          threshold: 0.6
        })
      });

      if (!response.ok) continue;
      
      const data = await response.json();
      const relations = data.relations || [];
      const entities = data.entities || [];
      
      totalRelations += relations.length;
      
      for (const rel of relations) {
        typeCounts[rel.label] = (typeCounts[rel.label] || 0) + 1;
        if (rel.head === 'User') {
          userAttributed++;
        } else {
          thirdPartyAttributed++;
        }
      }
    } catch (e) {
      console.warn('Error connecting to Modal Engine on record ' + i + ': ' + e.message);
    }
  }

  console.log('\n==================================================');
  console.log('   GATE 2: DIAGNOSTIC TABLE (DRY RUN RESULTS)');
  console.log('==================================================');
  const passRate = ((passedCandidateFilter / records.length) * 100).toFixed(1);
  console.log(`Candidate Filter Pass-Rate : ${passedCandidateFilter}/${records.length} (${passRate}%)`);
  
  console.log(`\nAttribution Split:`);
  console.log(`  User-Attributed        : ${userAttributed}`);
  console.log(`  Third-Party Attributed : ${thirdPartyAttributed}`);
  
  console.log(`\nRaw Per-Type Counts (Unscored against Ground Truth):`);
  if (Object.keys(typeCounts).length === 0) {
    console.log('  [None extracted]');
  } else {
    for (const [label, count] of Object.entries(typeCounts)) {
      console.log(`  ${label.padEnd(20)} : ${count}`);
    }
  }
  console.log('==================================================');
  console.log('Gate 2 Dry Run Complete.');
}

runGate2().catch(console.error);
