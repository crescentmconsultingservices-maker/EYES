import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!rawUrl || !rawKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin operations.');
  }

  const supabaseUrl = rawUrl.trim().replace(/[\r\n]/g, '');
  const serviceRoleKey = rawKey.trim().replace(/[\r\n]/g, '');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
