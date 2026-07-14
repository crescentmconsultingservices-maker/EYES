const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '../.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ENRON_USER_ID = '99999999-9999-9999-9999-999999999999';

// Implicit commitment and delay patterns to search for
const patterns = [
  /i'll/i, /we'll/i, /let me/i, /count on me/i, /leave it (with|to) me/i, 
  /will/i, /promise/i, /waiting/i, /blocked/i, /stuck/i, /delay/i, /late/i,
  /decide/i, /pass on/i, /drop/i, /scrap/i
];

async function run() {
  console.log(`Fetching GMAIL records for Enron Volunteer (${ENRON_USER_ID})...`);
  
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', ENRON_USER_ID)
    .eq('platform', 'gmail');

  if (error) {
    console.error("Error fetching data:", error);
    process.exit(1);
  }

  const eligibleRecords = data.filter(r => {
    let text = r.raw_text || (r.payload && r.payload.text) || (r.payload && r.payload.content) || r.content || '';
    return text.trim().length > 0;
  });

  console.log(`Fetched ${eligibleRecords.length} eligible GMAIL records from Enron Volunteer.`);

  const implicitRecords = [];
  const normalRecords = [];

  for (const record of eligibleRecords) {
    let text = record.raw_text || (record.payload && record.payload.text) || (record.payload && record.payload.content) || record.content || '';
    
    const isImplicit = patterns.some(regex => regex.test(text));
    if (isImplicit) {
      implicitRecords.push(record);
    } else {
      normalRecords.push(record);
    }
  }

  console.log(`Found ${implicitRecords.length} GMAIL records with implicit commitments/delays.`);

  // Curate 50 records: At least 15 implicit, rest random
  const curated = [];
  
  // Take up to 20 implicit records
  const numImplicit = Math.min(20, implicitRecords.length);
  for (let i = 0; i < numImplicit; i++) {
    curated.push(implicitRecords[i]);
  }

  // Fill the rest to make 50
  const remainingNeeded = 50 - curated.length;
  for (let i = 0; i < remainingNeeded && i < normalRecords.length; i++) {
    curated.push(normalRecords[i]);
  }

  console.log(`Curated a total of ${curated.length} records (${numImplicit} implicit).`);

  const outputPath = '../artifacts/ground_truth_dataset.json';
  fs.writeFileSync(outputPath, JSON.stringify(curated, null, 2), 'utf-8');
  
  let mdContent = `# Ground Truth Sample for Labeling\n\n**Corpus:** Tommy/Chandru (Volunteer Test Account)\n**Platform:** GMAIL Only\n**Records:** ${curated.length}\n**Implicit/Targeted Cases:** ${numImplicit}\n\n---\n\n`;
  curated.forEach((record, i) => {
    mdContent += `### Record ${i + 1} (ID: ${record.id})\n`;
    mdContent += `**Source:** ${record.platform || 'unknown'}\n\n`;
    
    let text = record.raw_text || (record.payload && record.payload.text) || (record.payload && record.payload.content) || record.content || 'No content';
    
    mdContent += `${text}\n\n---\n\n`;
  });
  
  const mdPath = '../artifacts/sample_emails_for_labeling.md';
  fs.writeFileSync(mdPath, mdContent, 'utf-8');
  console.log(`Wrote dataset to ${outputPath} and ${mdPath}`);
}

run();
