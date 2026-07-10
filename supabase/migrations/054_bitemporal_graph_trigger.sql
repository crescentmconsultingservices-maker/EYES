-- Migration 054: Bi-Temporal Graphiti Logic via Postgres Trigger
-- This completely replaces the need for a separate Neo4j/Graphiti server.
-- It automatically manages the valid_to timeline of chronic_edges.

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION trg_manage_bitemporal_edges()
RETURNS TRIGGER AS $$
BEGIN
    -- Set valid_from if not provided
    IF NEW.valid_from IS NULL THEN
        NEW.valid_from := NOW();
    END IF;

    -- If there is an existing ACTIVE edge between the exact same head and tail
    -- (meaning the status of the relationship has changed, e.g., 'commitment' -> 'delayed_on' or 'resolved')
    -- We must close out the timeline of the old edge.
    IF EXISTS (
        SELECT 1 FROM chronic_edges 
        WHERE user_id = NEW.user_id 
        AND head_node_id = NEW.head_node_id 
        AND tail_node_id = NEW.tail_node_id 
        AND valid_to IS NULL
        AND id != NEW.id -- just in case
    ) THEN
        -- Expire the old active edge(s) exactly at the moment this new one becomes valid
        UPDATE chronic_edges
        SET 
            valid_to = NEW.valid_from,
            is_contradicted_by = NEW.id,
            updated_at = NOW()
        WHERE user_id = NEW.user_id 
        AND head_node_id = NEW.head_node_id 
        AND tail_node_id = NEW.tail_node_id 
        AND valid_to IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Bind the trigger to chronic_edges
DROP TRIGGER IF EXISTS ensure_bitemporal_timeline ON chronic_edges;
CREATE TRIGGER ensure_bitemporal_timeline
BEFORE INSERT ON chronic_edges
FOR EACH ROW
EXECUTE FUNCTION trg_manage_bitemporal_edges();

-- 3. Backfill existing data
UPDATE chronic_edges SET valid_from = created_at WHERE valid_from IS NULL;
