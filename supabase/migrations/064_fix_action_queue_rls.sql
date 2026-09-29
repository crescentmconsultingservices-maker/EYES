-- ============================================================
-- EYES Migration 064: Fix Action Queue & Sent Log RLS Security
-- 
-- Vulnerability Fix:
-- Drops policies that lacked an explicit 'TO service_role' clause.
-- Without 'TO service_role', 'USING (true)' policies defaulted to 'PUBLIC'
-- and were OR'd with user ownership checks, allowing any authenticated user
-- to read all other users' action queues and sent message logs.
-- ============================================================

-- 1. ACTION_QUEUE
DROP POLICY IF EXISTS "Service role full access" ON public.action_queue;

CREATE POLICY "Service role full access"
  ON public.action_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. ACTION_SENT_LOG (Immutable log for sent messages/emails)
DROP POLICY IF EXISTS "Service role full access sent logs" ON public.action_sent_log;

CREATE POLICY "Service role full access sent logs"
  ON public.action_sent_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. ACTION_EXTRACTION_LOG
DROP POLICY IF EXISTS "Service role full access extraction log" ON public.action_extraction_log;

CREATE POLICY "Service role full access extraction log"
  ON public.action_extraction_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. INSIGHTS
DROP POLICY IF EXISTS "Service role can manage insights" ON public.insights;

CREATE POLICY "Service role can manage insights"
  ON public.insights FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. DETECTED_LOOPS
DROP POLICY IF EXISTS "Service role has full access to loops" ON public.detected_loops;

CREATE POLICY "Service role has full access to loops"
  ON detected_loops FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. AUDITS (Legacy)
DROP POLICY IF EXISTS "Service role full access on audits" ON public.audits;

CREATE POLICY "Service role full access on audits"
  ON public.audits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. PROMPT_VERSIONS
DROP POLICY IF EXISTS "service_write_prompts" ON public.prompt_versions;

CREATE POLICY "service_write_prompts"
  ON public.prompt_versions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
