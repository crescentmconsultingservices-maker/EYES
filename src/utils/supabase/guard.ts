/**
 * src/utils/supabase/guard.ts
 *
 * Fix 3: createAdminClient() blast-radius limiter.
 *
 * Every API route that calls createAdminClient() (service_role — bypasses all
 * RLS) must be invoked through requireAdminAccess() so that:
 *   a) The calling user is authenticated (prevents unauthenticated service-role use)
 *   b) An audit record is written to service_role_access_audit for every admin
 *      DB operation that touches PII tables
 *
 * Usage in an API route:
 *   const { user, supabase: adminSupabase } = await requireAdminAccess(request, 'sync-cron');
 *   // supabase is now a service-role client but the caller is verified authenticated.
 */
import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';

export type AdminAccessResult = {
  user: { id: string; email?: string };
  supabase: Awaited<ReturnType<typeof createAdminClient>>;
};

/**
 * Verifies that an API request is authenticated before granting access to the
 * admin (service_role) Supabase client. Writes an audit record on every grant.
 *
 * @param request    - The incoming Next.js Request
 * @param hint       - Human-readable label for the calling code path (shows in audit log)
 * @param targetUser - The user_id whose data will be accessed (for audit record)
 * @returns          - Resolved user + admin Supabase client, or a NextResponse error
 */
export async function requireAdminAccess(
  request: Request,
  hint: string,
  targetUser?: string,
): Promise<AdminAccessResult | NextResponse> {
  // 1. Verify the caller is authenticated via the user-scoped client
  const userClient = await createClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Grant the admin client
  const adminSupabase = await createAdminClient();

  // 3. Write an audit record (non-blocking — never fail the main operation)
  writeAdminAccessAudit(adminSupabase, {
    operation: 'GRANT',
    tableName: '(admin client granted)',
    userId: targetUser || user.id,
    accessorHint: hint,
  }).catch(() => {/* never throw */});

  return { user, supabase: adminSupabase };
}

interface AuditEntry {
  operation: string;
  tableName: string;
  userId?: string;
  rowCount?: number;
  accessorHint: string;
}

/**
 * Writes a record to service_role_access_audit.
 * Call this whenever a code path uses createAdminClient() to touch PII tables
 * (memories, oauth_tokens, chat_messages, chronic_nodes, chronic_edges, etc.).
 *
 * Non-throwing — audit failures must never silently break the main operation.
 */
export async function writeAdminAccessAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  entry: AuditEntry,
): Promise<void> {
  try {
    await adminSupabase.from('service_role_access_audit').insert({
      operation: entry.operation,
      table_name: entry.tableName,
      user_id: entry.userId ?? null,
      row_count: entry.rowCount ?? null,
      accessor_hint: entry.accessorHint,
    });
  } catch (err) {
    // Audit failures are always non-fatal — log but never crash the caller
    console.error('[AdminGuard] Audit write failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * isAdminAccessResult type guard — distinguishes a successful grant from an
 * error NextResponse so callers can do a simple narrowing check:
 *
 *   const result = await requireAdminAccess(req, 'my-route');
 *   if (!isAdminAccessResult(result)) return result;   // return the 401/403
 *   const { user, supabase } = result;                 // fully typed from here
 */
export function isAdminAccessResult(
  result: AdminAccessResult | NextResponse,
): result is AdminAccessResult {
  return !(result instanceof NextResponse);
}
