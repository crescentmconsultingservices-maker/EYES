import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildGateRunB() {
  const sourcePath = path.join(__dirname, 'EmailIntentDataSet', 'src', 'resources', 'testSet-qualifiedBatch-fixed.txt');
  const targetPath = path.join(__dirname, '../artifacts/gate_run_b_labeling.md');

  const content = fs.readFileSync(sourcePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Skip the first 50 we used earlier (25 Yes, 25 No)
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

  let mdContent = `# Gate Run B - Fresh Data for Hand-Labeling\n\n`;
  mdContent += `**Instructions:** Review the 100 fresh records below. Apply strict business logic. If there is a rigid, first-person commitment ('I will do X'), label it \`[commitment]\`. Otherwise, leave it as \`[None]\`.\n\n---\n\n`;

  freshRecords.forEach((record, index) => {
    mdContent += `### Record ${index + 1}\n`;
    mdContent += `> ${record}\n\n`;
    mdContent += `**Label:** \n\n---\n\n`;
  });

  fs.writeFileSync(targetPath, mdContent);
  console.log(`Successfully generated 100 fresh records at artifacts/gate_run_b_labeling.md`);
}

buildGateRunB();
