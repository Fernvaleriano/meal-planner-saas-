-- Client Protocols / Supplement Table
-- Allows coaches to manage supplement protocols for their clients
-- Supports scheduled dosing with phases and custom timing

CREATE TABLE IF NOT EXISTS client_protocols (
    id BIGSERIAL PRIMARY KEY,

    -- Foreign keys
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Basic protocol info
    name VARCHAR(255) NOT NULL,
    timing VARCHAR(50) DEFAULT 'morning', -- morning, pre_workout, post_workout, bedtime, with_meals, custom
    timing_custom VARCHAR(255), -- Custom timing description when timing = 'custom'

    -- Dosing info
    dose VARCHAR(255), -- Simple dose when not using schedule (e.g., "5g", "2 capsules")
    has_schedule BOOLEAN DEFAULT false,
    schedule JSONB, -- Array of phases: [{weekStart: 1, weekEnd: 4, dose: "5g"}, ...]
    start_date DATE, -- Start date for scheduled protocols

    -- Notes
    notes TEXT, -- Public notes visible to client
    private_notes TEXT, -- Private notes for coach only

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_client_protocols_coach ON client_protocols(coach_id);
CREATE INDEX IF NOT EXISTS idx_client_protocols_client ON client_protocols(client_id);
CREATE INDEX IF NOT EXISTS idx_client_protocols_coach_client ON client_protocols(coach_id, client_id);

-- Enable Row Level Security
ALTER TABLE client_protocols ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can view protocols for their own clients
CREATE POLICY "Coaches can view own client protocols" ON client_protocols
    FOR SELECT
    USING (auth.uid() = coach_id);

-- Policy: Coaches can insert protocols for their own clients
CREATE POLICY "Coaches can insert own client protocols" ON client_protocols
    FOR INSERT
    WITH CHECK (auth.uid() = coach_id);

-- Policy: Coaches can update protocols for their own clients
CREATE POLICY "Coaches can update own client protocols" ON client_protocols
    FOR UPDATE
    USING (auth.uid() = coach_id);

-- Policy: Coaches can delete protocols for their own clients
CREATE POLICY "Coaches can delete own client protocols" ON client_protocols
    FOR DELETE
    USING (auth.uid() = coach_id);

-- Policy: Clients can view their own protocols (public notes only access controlled in API)
CREATE POLICY "Clients can view own protocols" ON client_protocols
    FOR SELECT
    USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_client_protocols_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
DROP TRIGGER IF EXISTS client_protocols_updated_at ON client_protocols;
CREATE TRIGGER client_protocols_updated_at
    BEFORE UPDATE ON client_protocols
    FOR EACH ROW
    EXECUTE FUNCTION update_client_protocols_updated_at();
