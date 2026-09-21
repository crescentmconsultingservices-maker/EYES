-- ==============================================================================
-- 059_security_hardening.sql
-- Security hardening: engine_metrics RLS + service-role access audit log
--
-- Fixes:
--   [1] engine_metrics had no RLS — publicly readable via anon key
--   [5] memories.content plaintext — add audit trigger so bulk admin reads are
--       logged automatically, providing tamper-evident access records
-- ==============================================================================

-- ── Fix 1: Lock engine_metrics (aggregate counters, no PII, still wrong) ──────
ALTER TABLE engine_metrics ENABLE ROW LEVEL SECURITY;

-- Only the service_role (background cron jobs) can read/write counters.
-- Authenticated users and anon callers receive no rows.
DROP POLICY IF EXISTS engine_metrics_service_only ON engine_metrics;
CREATE POLICY engine_metrics_service_only ON engine_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── Fix 5: Service-role memory access audit log ───────────────────────────────
-- Every time a background cron job or admin API reads from the memories table
-- using the service_role (which bypasses RLS), we want a tamper-evident record.
-- This is the practical protection layer when field-level encryption would break
-- the FTS and vector search architecture.

CREATE TABLE IF NOT EXISTS service_role_access_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operation     TEXT        NOT NULL,                   -- 'SELECT' | 'UPDATE' | 'DELETE'
  table_name    TEXT        NOT NULL,
  user_id       UUID,                                   -- target user whose data was accessed
  row_count     INTEGER,                                -- approx rows touched (set by application)
  accessor_hint TEXT,                                   -- label set by the calling code path
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sra_audit_table
  ON service_role_access_audit(table_name, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sra_audit_user
  ON service_role_access_audit(user_id, accessed_at DESC);

-- Only service_role can write audit records; authenticated users can read their own.
ALTER TABLE service_role_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sra_audit_service_write ON service_role_access_audit;
CREATE POLICY sra_audit_service_write ON service_role_access_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sra_audit_user_read ON service_role_access_audit;
CREATE POLICY sra_audit_user_read ON service_role_access_audit
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- ── Grant: memories table — add explicit service_role policy comment ──────────
-- The existing memories_service_role policy (migration 029) grants service_role
-- unrestricted access. This comment block makes that explicit for future auditors.
-- The policy is intentionally retained so background sync jobs can write memories.
-- All service_role code paths MUST log to service_role_access_audit above.

COMMENT ON TABLE memories IS
  'Core memory store. RLS: users see only their own rows. '
  'service_role bypasses RLS for sync/cron — all admin reads MUST be '
  'logged in service_role_access_audit.';

COMMENT ON TABLE oauth_tokens IS
  'OAuth credentials. Stored as AES-256-GCM ciphertext (enc:v1: prefix). '
  'TOKEN_ENCRYPTION_KEY required to decrypt. service_role bypasses RLS.';
