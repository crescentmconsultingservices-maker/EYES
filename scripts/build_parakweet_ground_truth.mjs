import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildParakweetDataset() {
  const sourcePath = path.join(__dirname, 'EmailIntentDataSet', 'src', 'resources', 'testSet-qualifiedBatch-fixed.txt');
  const targetPath = path.join(__dirname, '../artifacts/ground_truth_dataset_v2.json');

  const content = fs.readFileSync(sourcePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const yesSentences = [];
  const noSentences = [];

  lines.forEach(line => {
    if (line.startsWith('Yes\t')) yesSentences.push(line.replace('Yes\t', ''));
    if (line.startsWith('No\t')) noSentences.push(line.replace('No\t', ''));
  });

  // Take exactly 25 Yes (Commitments) and 25 No (Noise) for a clean 50-record test
  const testSet = [];
  for (let i = 0; i < 25; i++) {
    if (yesSentences[i]) {
      testSet.push({
        record_id: `parakweet-yes-${i}`,
        content: yesSentences[i],
        human_labels: ["commitment"]
      });
    }
    if (noSentences[i]) {
      testSet.push({
        record_id: `parakweet-no-${i}`,
        content: noSentences[i],
        human_labels: ["None"]
      });
    }
  }

  fs.writeFileSync(targetPath, JSON.stringify({ records: testSet }, null, 2));
  console.log(`Successfully compiled Ground Truth v2. Total records: ${testSet.length} (50% signal, 50% noise).`);
}

buildParakweetDataset();
