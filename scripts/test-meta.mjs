import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const clientId = process.env.META_CLIENT_ID?.trim();
const clientSecret = process.env.META_CLIENT_SECRET?.trim();

console.log('Testing Meta App Credentials:');
console.log('App ID:', clientId);
console.log('App Secret Length:', clientSecret ? clientSecret.length : 0);

async function testMeta() {
  if (!clientId || !clientSecret) {
    console.error('❌ Missing META_CLIENT_ID or META_CLIENT_SECRET in .env.local');
    return;
  }

  try {
    // 1. Fetch App Access Token using client credentials grant
    const tokenUrl = new URL('https://graph.facebook.com/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('grant_type', 'client_credentials');

    console.log('\n[1/3] Requesting App Access Token from Meta Graph API...');
    const res = await fetch(tokenUrl.toString());
    const data = await res.json();

    console.log('HTTP Status:', res.status);
    if (!res.ok || data.error) {
      console.log('❌ Error validating Meta credentials:');
      console.log(JSON.stringify(data.error, null, 2));
      return;
    }

    console.log('✅ Success! Meta credentials are VALID.');
    console.log('Token Type:', data.token_type);
    const appToken = data.access_token;

    // 2. Fetch App details or inspect token via debug_token
    console.log('\n[2/3] Checking Token Debug endpoint...');
    const debugUrl = new URL('https://graph.facebook.com/debug_token');
    debugUrl.searchParams.set('input_token', appToken);
    debugUrl.searchParams.set('access_token', appToken);

    const debugRes = await fetch(debugUrl.toString());
    const debugData = await debugRes.json();
    console.log('Debug Token Status:', debugRes.status);
    console.log('Debug Token Data:', JSON.stringify(debugData, null, 2));

    // Also check if any Meta / Facebook tokens exist in Supabase for any user
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: fbTokens } = await sb
      .from('oauth_tokens')
      .select('user_id, platform, expires_at, updated_at')
      .in('platform', ['meta', 'facebook']);
    console.log('\n[4/4] Checking Meta tokens in Supabase DB:');
    console.log('Stored Meta/Facebook tokens:', fbTokens);

    // 3. Test OAuth dialog URL generation
    console.log('\n[3/3] Checking OAuth dialog URL...');
    const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/api/connect/facebook/callback');
    authUrl.searchParams.set('state', 'test_state');
    authUrl.searchParams.set('scope', 'public_profile,email');
    console.log('Generated Auth Dialog URL:', authUrl.toString());

  } catch (err) {
    console.error('❌ Fetch failed:', err.message);
  }
}

testMeta();
