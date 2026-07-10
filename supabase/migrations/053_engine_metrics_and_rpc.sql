-- Migration: Create System Metrics Table & Atomic Increment RPC

CREATE TABLE IF NOT EXISTS engine_metrics (
    metric_name TEXT PRIMARY KEY,
    metric_value BIGINT DEFAULT 0
);

-- Insert initial values safely
INSERT INTO engine_metrics (metric_name, metric_value) 
VALUES 
    ('total_records_processed', 0), 
    ('total_records_routed_to_llm', 0)
ON CONFLICT (metric_name) DO NOTHING;

-- Create an RPC to atomically increment the metric and return the new value
CREATE OR REPLACE FUNCTION increment_engine_metric(metric_name TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_val BIGINT;
BEGIN
    UPDATE engine_metrics
    SET metric_value = metric_value + 1
    WHERE engine_metrics.metric_name = increment_engine_metric.metric_name
    RETURNING metric_value INTO new_val;
    
    RETURN new_val;
END;
$$;
