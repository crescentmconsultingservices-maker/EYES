-- Revenue Leak Scan isolated tables
-- Built to be completely decoupled from the core application

CREATE TABLE IF NOT EXISTS leak_scans (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_stated_fee NUMERIC DEFAULT 7000,
    status TEXT NOT NULL DEFAULT 'processing', -- processing, complete, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    purge_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE TABLE IF NOT EXISTS leak_scan_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES leak_scans(scan_id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    counterparty_name TEXT,
    counterparty_domain TEXT,
    last_activity_date TIMESTAMPTZ,
    days_silent INTEGER,
    leak_type TEXT, -- OPEN_PROPOSAL, DROPPED_COMMITMENT, GHOSTED_CLIENT, UNANSWERED_INBOUND
    confidence NUMERIC,
    est_value_eur NUMERIC,
    evidence JSONB,
    recovery_angle TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast deletion by the cron job
CREATE INDEX IF NOT EXISTS idx_leak_scans_purge_at ON leak_scans(purge_at);

-- RLS Policies (Isolated to the user who requested the scan)
ALTER TABLE leak_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE leak_scan_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own leak scans"
    ON leak_scans FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leak scans"
    ON leak_scans FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leak scans"
    ON leak_scans FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own leak scan threads"
    ON leak_scan_threads FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM leak_scans 
        WHERE leak_scans.scan_id = leak_scan_threads.scan_id 
        AND leak_scans.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert their own leak scan threads"
    ON leak_scan_threads FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM leak_scans 
        WHERE leak_scans.scan_id = leak_scan_threads.scan_id 
        AND leak_scans.user_id = auth.uid()
    ));
