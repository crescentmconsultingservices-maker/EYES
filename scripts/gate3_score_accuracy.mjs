import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_URL = 'http://127.0.0.1:8000/extract';

async function runGate3() {
  console.log('--- GATE 5: THE FINAL EXAM (GATE RUN B) ---');
  
  const frozenPath = path.join(__dirname, '../artifacts/ground_truth_dataset_run_b.json');
  const frozenData = JSON.parse(fs.readFileSync(frozenPath, 'utf-8'));
  const records = frozenData.records || frozenData;
  console.log(`Evaluating against ${records.length} Ground Truth records...`);
  
  let totalGT = 0;
  let totalExtracted = 0;
  let truePositives = 0;
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const text = record.content || '';
    
    // Normalize human labels
    let gtLabels = record.human_labels || [];
    if (gtLabels.length === 1 && gtLabels[0] === "None") {
      gtLabels = [];
    }
    totalGT += gtLabels.length;

    let extractedLabels = [];
    let extractedRelations = [];
    try {
      const response = await fetch(ENGINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 1000),
          threshold: 0.6
        })
      });

      if (response.ok) {
        const data = await response.json();
        const relations = data.relations || [];
        extractedRelations = relations.filter(r => r.head === 'User');
        extractedLabels = extractedRelations.map(r => r.label);
      }
    } catch (e) {
      console.warn('Engine error on record ' + i + ': ' + e.message);
    }

    totalExtracted += extractedLabels.length;
    
    if (extractedLabels.length > 0 || gtLabels.length > 0) {
      console.log(`\n--- RECORD ${i} ---`);
      console.log(`TEXT SNIPPET: "${text.slice(0, 200).replace(/\n/g, ' ')}..."`);
      console.log(`HUMAN LABELED AS: ${JSON.stringify(gtLabels)}`);
      console.log(`LLM EXTRACTED:`);
      if (extractedRelations.length === 0) {
        console.log("  [None]");
      } else {
        extractedRelations.forEach(r => console.log(`  -> [${r.label}] ${r.tail}`));
      }
    }

    // Calculate True Positives for this record
    // We create a copy of gtLabels to match 1-to-1
    let matchedGT = [...gtLabels];
    for (const label of extractedLabels) {
      const matchIndex = matchedGT.indexOf(label);
      if (matchIndex !== -1) {
        truePositives++;
        matchedGT.splice(matchIndex, 1); // consume the match
      }
    }
  }

  const falsePositives = totalExtracted - truePositives;
  const falseNegatives = totalGT - truePositives;

  const precision = totalExtracted > 0 ? (truePositives / totalExtracted) * 100 : 0;
  const recall = totalGT > 0 ? (truePositives / totalGT) * 100 : 0;
  
  // F1 Score
  const f1 = (precision + recall) > 0 ? 2 * ((precision * recall) / (precision + recall)) : 0;
  
  // Custom "Accuracy" as requested (e.g. weighted score or simple average)
  const accuracy = (precision + recall) / 2;

  console.log('\n==================================================');
  console.log('       GATE 3: ACCURACY MEMO & SCORECARD');
  console.log('==================================================');
  console.log(`Total Ground Truth Relations : ${totalGT}`);
  console.log(`Total Engine Extractions     : ${totalExtracted}`);
  console.log(`True Positives (Correct)     : ${truePositives}`);
  console.log(`False Positives (Noise)      : ${falsePositives}`);
  console.log(`False Negatives (Missed)     : ${falseNegatives}`);
  console.log('--------------------------------------------------');
  console.log(`Precision : ${precision.toFixed(1)}%`);
  console.log(`Recall    : ${recall.toFixed(1)}%`);
  console.log(`F1 Score  : ${f1.toFixed(1)}%`);
  console.log('--------------------------------------------------');
  console.log(`FINAL ACCURACY SCORE: ${accuracy.toFixed(1)}%`);
  console.log('==================================================');
  
  if (accuracy >= 85.0) {
    console.log('[PASSED] The Engine has exceeded the 85% requirement.');
    console.log('[ACTION] Proceed to Phase 5 Production Deployment.');
  } else {
    console.log('[FAILED] The Engine missed the 85% requirement.');
    console.log('[ACTION] Stop. Do not deploy. Tune the Engine.');
  }
}

runGate3().catch(console.error);
