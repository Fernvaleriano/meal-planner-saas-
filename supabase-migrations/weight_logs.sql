-- Weight Logs Table
-- Stores weight entries for clients with trend tracking

CREATE TABLE IF NOT EXISTS weight_logs (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    weight DECIMAL(5,1) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One weight entry per client per day
    UNIQUE(client_id, date)
);

-- Index for fast lookups and trend queries
CREATE INDEX IF NOT EXISTS idx_weight_logs_client_date ON weight_logs(client_id, date DESC);

-- Row Level Security
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

-- Clients can read their own weight logs
CREATE POLICY "Clients can read own weight logs"
    ON weight_logs
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can insert their own weight logs
CREATE POLICY "Clients can insert own weight logs"
    ON weight_logs
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can update their own weight logs
CREATE POLICY "Clients can update own weight logs"
    ON weight_logs
    FOR UPDATE
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can delete their own weight logs
CREATE POLICY "Clients can delete own weight logs"
    ON weight_logs
    FOR DELETE
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Coaches can view their clients' weight logs
CREATE POLICY "Coaches can view client weight logs"
    ON weight_logs
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients WHERE coach_id = auth.uid()
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_weight_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weight_logs_updated_at
    BEFORE UPDATE ON weight_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_weight_logs_timestamp();
