-- ==============================================================================
-- 060_content_hash_column.sql
-- Adds content_hash (SHA-256) to memories for deduplication without decryption.
--
-- TIMEOUT FIX: The original single UPDATE on all rows times out on large tables.
-- We now batch the backfill in chunks of 500 rows using a PL/pgSQL loop so each
-- statement stays well under the SQL editor's statement timeout.
-- ==============================================================================

-- Step 1: Add the column (instant DDL — no data movement)
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Step 2: Create the index before the backfill.
--         (CONCURRENTLY is not allowed inside a transaction block — plain CREATE INDEX is fine here)
CREATE INDEX IF NOT EXISTS idx_memories_content_hash
  ON memories(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Step 3: Chunked backfill — processes 500 rows per iteration.
--         Each UPDATE is tiny and commits independently, so no single statement
--         can hit the timeout ceiling.
DO $$
DECLARE
  updated INT;
BEGIN
  LOOP
    UPDATE memories
    SET content_hash = encode(digest(content, 'sha256'), 'hex')
    WHERE id IN (
      SELECT id
      FROM   memories
      WHERE  content IS NOT NULL
        AND  content_hash IS NULL
      LIMIT  500          -- tune this lower (e.g. 200) if you still see timeouts
    );

    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;   -- stop when there is nothing left to patch
  END LOOP;
END;
$$;

-- Step 4: Column comment
COMMENT ON COLUMN memories.content_hash IS
  'SHA-256 hex digest of the plaintext content. '
  'Stable deduplication anchor that works without decryption when '
  'ENCRYPT_MEMORY_CONTENT=true is active.';
