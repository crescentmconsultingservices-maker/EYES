import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildRunBDataset() {
  const sourcePath = path.join(__dirname, 'EmailIntentDataSet', 'src', 'resources', 'testSet-qualifiedBatch-fixed.txt');
  const targetPath = path.join(__dirname, '../artifacts/ground_truth_dataset_run_b.json');

  const content = fs.readFileSync(sourcePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let yesCount = 0;
  let noCount = 0;
  
  const freshRecords = [];

  for (const line of lines) {
    if (freshRecords.length >= 100) break;
    if (line.startsWith('Yes\t')) {
      yesCount++;
      if (yesCount > 25) freshRecords.push(line.replace('Yes\t', ''));
    }
    if (line.startsWith('No\t')) {
      noCount++;
      if (noCount > 25) freshRecords.push(line.replace('No\t', ''));
    }
  }

  // User's strictly verified index labels (1-indexed based on their review)
  const commitments = new Set([30, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 59, 60, 72, 78]);
  const delays = new Set([24, 32, 52, 60, 87, 99]);
  const decisions = new Set([22, 25, 26, 27, 29, 31, 34, 51, 55, 56, 57, 67, 81, 84, 93, 98]);

  const testSet = [];
  
  freshRecords.forEach((record, idx) => {
    const recordNum = idx + 1; // User used 1-based indexing
    const human_labels = [];
    
    if (commitments.has(recordNum)) human_labels.push("commitment");
    if (delays.has(recordNum)) human_labels.push("delayed_on");
    if (decisions.has(recordNum)) human_labels.push("decided_against");
    
    // If it has no labels, it's None.
    if (human_labels.length === 0) human_labels.push("None");

    testSet.push({
      record_id: `exam-b-${recordNum}`,
      content: record,
      human_labels: human_labels
    });
  });

  fs.writeFileSync(targetPath, JSON.stringify({ records: testSet }, null, 2));
  console.log(`Successfully compiled Ground Truth Run B. Total records: ${testSet.length}.`);
}

buildRunBDataset();
