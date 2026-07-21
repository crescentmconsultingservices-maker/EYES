-- Migration to add Valuation fields (T1-T4) to leak_scan_threads
-- Based on the Ref architecture clean-room spec

ALTER TABLE leak_scan_threads
ADD COLUMN value_tier TEXT CHECK (value_tier IN ('T1', 'T2', 'T3', 'T4')),
ADD COLUMN quantity INTEGER,
ADD COLUMN unit_price NUMERIC,
ADD COLUMN unit_hint TEXT,
ADD COLUMN recoverable_value_eur NUMERIC;
