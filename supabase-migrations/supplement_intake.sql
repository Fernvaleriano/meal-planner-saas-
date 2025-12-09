-- Supplement Intake Tracking Table
-- Tracks when clients take their supplements from their assigned protocols
-- Resets daily - clients check off each supplement as they take it

CREATE TABLE IF NOT EXISTS supplement_intake (
    id BIGSERIAL PRIMARY KEY,

    -- Foreign keys
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    protocol_id BIGINT NOT NULL REFERENCES client_protocols(id) ON DELETE CASCADE,

    -- Tracking info
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint: one entry per protocol per day per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplement_intake_unique
    ON supplement_intake(client_id, protocol_id, date);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_supplement_intake_client ON supplement_intake(client_id);
CREATE INDEX IF NOT EXISTS idx_supplement_intake_client_date ON supplement_intake(client_id, date);
CREATE INDEX IF NOT EXISTS idx_supplement_intake_protocol ON supplement_intake(protocol_id);

-- Enable Row Level Security
ALTER TABLE supplement_intake ENABLE ROW LEVEL SECURITY;

-- Policy: Clients can view their own supplement intake
CREATE POLICY "Clients can view own supplement intake" ON supplement_intake
    FOR SELECT
    USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Policy: Clients can insert their own supplement intake
CREATE POLICY "Clients can insert own supplement intake" ON supplement_intake
    FOR INSERT
    WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Policy: Clients can delete their own supplement intake (to uncheck)
CREATE POLICY "Clients can delete own supplement intake" ON supplement_intake
    FOR DELETE
    USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Policy: Coaches can view supplement intake for their clients
CREATE POLICY "Coaches can view client supplement intake" ON supplement_intake
    FOR SELECT
    USING (
        client_id IN (SELECT id FROM clients WHERE coach_id = auth.uid())
    );
