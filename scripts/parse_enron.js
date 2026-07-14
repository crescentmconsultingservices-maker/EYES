const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

dotenv.config({ path: '../.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENRON_USER_ID = '99999999-9999-9999-9999-999999999999';

async function parseEmail(rawMessage) {
  // Extract headers and body
  const lines = rawMessage.split('\n');
  let inHeaders = true;
  let headers = {};
  let bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inHeaders) {
      if (line.trim() === '') {
        inHeaders = false;
        continue;
      }
      const match = line.match(/^([A-Za-z\-]+):\s*(.*)/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2];
      }
    } else {
      bodyLines.push(line);
    }
  }

  return {
    from: headers['from'] || 'unknown',
    to: headers['to'] || 'unknown',
    subject: headers['subject'] || '',
    date: headers['date'] || new Date().toISOString(),
    body: bodyLines.join('\n').trim()
  };
}

async function run() {
  console.log('Starting Enron Real Dataset Injection...');

  // Create user if not exists
  await supabase.auth.admin.createUser({
    id: ENRON_USER_ID,
    email: 'volunteer@enron.com',
    password: 'password123',
    email_confirm: true
  });
  
  await supabase.from('memories').delete().eq('user_id', ENRON_USER_ID);

  const fileStream = fs.createReadStream('../emails.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let records = [];
  let isFirstLine = true;
  
  let currentRecord = "";
  let inQuotes = false;
  
  let parsedCount = 0;

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    currentRecord += line + '\n';
    
    // Count quotes to see if we reached the end of the CSV record
    let quoteCount = 0;
    for (let i = 0; i < currentRecord.length; i++) {
      if (currentRecord[i] === '"') {
        // Handle escaped quotes ""
        if (i + 1 < currentRecord.length && currentRecord[i+1] === '"') {
          i++; // skip next
        } else {
          quoteCount++;
        }
      }
    }

    if (quoteCount % 2 === 0) {
      // Record complete
      // CSV format is "file","message"
      // We need to extract the message part
      let recordStr = currentRecord.trim();
      if (recordStr.startsWith('"') && recordStr.endsWith('"')) {
        // Find the comma that separates file from message
        const splitIdx = recordStr.indexOf('","');
        if (splitIdx !== -1) {
          const messageStr = recordStr.substring(splitIdx + 3, recordStr.length - 1);
          // unescape quotes
          const cleanMessage = messageStr.replace(/""/g, '"');
          
          const emailData = await parseEmail(cleanMessage);
          
          if (emailData.body.length > 20) { // filter out empty/short
            records.push({
              id: crypto.randomUUID(),
              source_id: `enron-real-${parsedCount}`,
              user_id: ENRON_USER_ID,
              platform: 'gmail',
              content: emailData.body,
              metadata: {
                from: emailData.from,
                to: emailData.to,
                subject: emailData.subject
              },
              timestamp: new Date(emailData.date).toISOString() || new Date().toISOString()
            });
            parsedCount++;
          }
        }
      }
      
      currentRecord = "";
      
      if (parsedCount >= 1000) {
        break; // Only need 1000 real emails to pick 50 from
      }
    }
  }

  rl.close();
  fileStream.destroy();

  console.log(`Parsed ${records.length} real Enron emails. Inserting...`);

  let inserted = 0;
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase.from('memories').insert(batch);
    if (error) {
      console.error('Error inserting batch:', error);
      return;
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${records.length} records...`);
  }

  console.log('Successfully injected real Enron records into Supabase!');
}

run().catch(console.error);
