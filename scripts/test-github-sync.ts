import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { executeGithubSync } from '@/services/sync/github-service';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = 'ee52cc29-db4a-44b9-9df4-a4244e5123d5';

async function run() {
  console.log(`🚀 Starting direct GitHub sync test for user: ${userId}...`);
  try {
    const result = await executeGithubSync({
      supabase,
      userId,
      userEmail: 'test@yourdomain.com',
      userName: 'Test User',
      mode: 'cron'
    }, 'delta');
    
    console.log('✅ Sync execution finished.');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

run();
