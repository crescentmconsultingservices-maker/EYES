import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const scanId = process.argv[2];

async function run() {
  const { data } = await supabase.from('leak_scan_threads').select('*').eq('scan_id', scanId);
  console.log(JSON.stringify(data, null, 2));
}
run();
