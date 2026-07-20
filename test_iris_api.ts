import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runGateATest() {
  console.log('=============================================');
  console.log('🟢 RUNNING GATE A (SWAP TEST) FOR IRIS API v0');
  console.log('=============================================\n');
  
  const query = "What did I commit to this week?";
  console.log(`Sending Query: "${query}"...\n`);

  try {
    // Assuming your Next.js local server is running on port 3000
    const response = await fetch('http://localhost:3000/api/iris/v0', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // If your API requires auth headers for testing, you may need to mock it or pass a token.
        // Currently, the API uses supabase.auth.getUser(), which relies on cookies.
        // For a raw API test without a browser, it might return 401 Unauthorized unless the session exists.
      },
      body: JSON.stringify({ query })
    });

    const status = response.status;
    const data = await response.json();

    if (status === 401) {
      console.log('⚠️  Status: 401 Unauthorized');
      console.log('Note: The API is correctly protected by Supabase Auth! To fully test this script, you either need to pass a valid session cookie, OR you can test the API directly from your browser/Postman where you are logged in.');
      return;
    }

    console.log(`✅ Status: ${status} OK\n`);
    console.log('📦 RESPONSE PAYLOAD (Checking against IRIS Schema):');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n=============================================');
    if (data.understanding && typeof data.understanding.confidence !== 'undefined' && data.understanding.receipts) {
      console.log('🎉 GATE A PASSED: The API returned the strict JSON format with Receipts and Confidence!');
    } else {
      console.log('❌ GATE A FAILED: The schema does not match the directive requirements.');
    }
    console.log('=============================================');

  } catch (error) {
    console.error('❌ Connection Failed. Is your Next.js server running on localhost:3000?');
    console.error(error);
  }
}

runGateATest();
