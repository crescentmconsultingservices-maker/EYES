-- ============================================================
-- EYES Migration 065: Add Action Queue Lazy Enrichment & Staleness Columns
-- ============================================================

ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_stale boolean DEFAULT false;

-- Create index for quick lookup of stale / enriched actions
CREATE INDEX IF NOT EXISTS idx_action_queue_enriched_stale
  ON public.action_queue(user_id, status, is_stale);
