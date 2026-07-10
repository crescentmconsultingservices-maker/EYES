-- Migration 052: Add source_url to chronic_edges for direct receipt anchoring

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'chronic_edges' 
        AND column_name = 'source_url'
    ) THEN
        ALTER TABLE chronic_edges ADD COLUMN source_url TEXT;
    END IF;
END $$;

COMMENT ON COLUMN chronic_edges.source_url IS 'Direct URL to the source record for immediate provenance (Phase 2 receipt anchoring).';
