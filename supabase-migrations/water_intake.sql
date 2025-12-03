-- Water Intake Tracking Table
-- Stores daily water intake for clients

CREATE TABLE IF NOT EXISTS water_intake (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    glasses INTEGER DEFAULT 0,
    goal INTEGER DEFAULT 8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint for one entry per client per day
    UNIQUE(client_id, date)
);

-- Index for fast lookups by client and date
CREATE INDEX IF NOT EXISTS idx_water_intake_client_date ON water_intake(client_id, date DESC);

-- Row Level Security
ALTER TABLE water_intake ENABLE ROW LEVEL SECURITY;

-- Clients can read their own water intake
CREATE POLICY "Clients can read own water intake"
    ON water_intake
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can insert their own water intake
CREATE POLICY "Clients can insert own water intake"
    ON water_intake
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can update their own water intake
CREATE POLICY "Clients can update own water intake"
    ON water_intake
    FOR UPDATE
    USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Coaches can view their clients' water intake
CREATE POLICY "Coaches can view client water intake"
    ON water_intake
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients WHERE coach_id = auth.uid()
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_water_intake_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER water_intake_updated_at
    BEFORE UPDATE ON water_intake
    FOR EACH ROW
    EXECUTE FUNCTION update_water_intake_timestamp();
