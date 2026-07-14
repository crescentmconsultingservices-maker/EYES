const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

dotenv.config({ path: '../.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENRON_USER_ID = '99999999-9999-9999-9999-999999999999';

const baseEmails = [
  { text: "Hi team, I'll review the Q3 budget numbers by Friday and get back to you.", type: "implicit" },
  { text: "Leave it with me, I will talk to Sarah about the merger documents tomorrow.", type: "implicit" },
  { text: "I am still waiting on the legal team for the contract. We are blocked until they approve.", type: "delay" },
  { text: "After reviewing the proposal, I have decided against moving forward with the vendor. Let's drop this project.", type: "decision" },
  { text: "Count on me to deliver the presentation slides before the board meeting.", type: "implicit" },
  { text: "Sorry for the delay, I'll send you the updated spreadsheets tonight.", type: "implicit" },
  { text: "We are scrapping the Alpha initiative. It's too costly. I will notify the shareholders.", type: "decision" },
  { text: "I've been stuck on the compliance review all week. I will need another two days.", type: "delay" },
  { text: "I'll handle the client escalation. Don't worry about it.", type: "implicit" },
  { text: "Let's pivot our strategy. I'm rejecting the current marketing plan.", type: "decision" },
  { text: "Can you send me the files? I will review them this weekend.", type: "implicit" },
  { text: "The project is on hold due to budget constraints. I'm delaying the launch.", type: "delay" },
  { text: "I promise to have the code deployed by EOD.", type: "implicit" },
  { text: "We decided to pass on the acquisition. I'll draft the rejection email.", type: "decision" },
  { text: "I'm still working on the Q4 projections. It's taking longer than expected.", type: "delay" },
  { text: "Just a quick update: I'll finish the audit reports by tomorrow morning.", type: "implicit" },
  { text: "Let me take care of the server migration. I'll do it on Sunday.", type: "implicit" },
  { text: "I am cancelling the upcoming offsite. We don't have the budget.", type: "decision" },
  { text: "I am currently blocked by the API outage. I'll resume work once it's fixed.", type: "delay" },
  { text: "I'll make sure the documents are signed and couriered to you.", type: "implicit" }
];

const fillerEmails = [
  "Thanks for the update. Let's catch up later.",
  "Can we reschedule our 1:1 to next week?",
  "Please see the attached invoice for last month's expenses.",
  "Happy Friday! Just a reminder to submit your timesheets.",
  "Who is organizing the farewell lunch for Mike?",
  "The coffee machine in the breakroom is broken again.",
  "Please review the attached meeting minutes.",
  "Are we still on for the 3 PM sync?",
  "I've approved your PTO request. Have a good trip!",
  "Reminder: The IT maintenance window is scheduled for tonight."
];

async function run() {
  console.log('Starting Enron Dataset Injection...');

  // Create user if not exists
  const { error: userError } = await supabase.auth.admin.createUser({
    id: ENRON_USER_ID,
    email: 'volunteer@enron.com',
    password: 'password123',
    email_confirm: true
  });
  
  if (userError) {
    console.log('Error creating user:', userError);
  }

  // 1. Delete old records for this user if they exist
  await supabase.from('memories').delete().eq('user_id', ENRON_USER_ID);

  const recordsToInsert = [];
  
  // Generate 600 records
  for (let i = 0; i < 600; i++) {
    const isBase = i < 150; // Ensure we have at least 150 high-quality commitment emails
    let text = "";
    
    if (isBase) {
      const template = baseEmails[i % baseEmails.length];
      text = template.text;
    } else {
      text = fillerEmails[i % fillerEmails.length];
    }

    recordsToInsert.push({
      id: crypto.randomUUID(),
      source_id: `enron-${i}`,
      user_id: ENRON_USER_ID,
      platform: 'gmail',
      content: text,
      metadata: {
        from: `employee${(i % 50) + 1}@enron.com`,
        to: `boss@enron.com`,
        subject: `Corporate Update ${i}`,
      },
      timestamp: new Date(Date.now() - Math.random() * 10000000000).toISOString()
    });
  }

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < recordsToInsert.length; i += 100) {
    const batch = recordsToInsert.slice(i, i + 100);
    const { error } = await supabase.from('memories').insert(batch);
    if (error) {
      console.error('Error inserting batch:', error);
      return;
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted}/600 records...`);
  }

  console.log('Successfully injected 600 Enron-style records into Supabase!');
}

run();
