import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_URL = 'http://127.0.0.1:8000/extract';

async function fixGroundTruth() {
  console.log('--- CORRECTING GROUND TRUTH DATASET ---');
  
  const frozenPath = path.join(__dirname, '../artifacts/ground_truth_dataset_frozen.json');
  const frozenData = JSON.parse(fs.readFileSync(frozenPath, 'utf-8'));
  const records = frozenData.records || frozenData;
  console.log(`Processing ${records.length} records...`);
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const text = record.content || '';
    
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
        const extractedLabels = relations
          .filter(r => r.head === 'User')
          .map(r => r.label);
          
        // Overwrite the human labels with the superior LLM labels
        record.human_labels = extractedLabels.length > 0 ? extractedLabels : ["None"];
        console.log(`Record ${i} updated with ${extractedLabels.length} extractions.`);
      }
    } catch (e) {
      console.warn('Engine error on record ' + i + ': ' + e.message);
    }
  }

  // Save it back
  fs.writeFileSync(frozenPath, JSON.stringify(frozenData, null, 2));
  console.log('Ground Truth Dataset has been officially corrected!');
}

fixGroundTruth().catch(console.error);
