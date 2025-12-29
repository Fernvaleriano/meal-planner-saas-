-- Migration: Add client_adhoc_workouts table
-- Purpose: Allow clients to create ad-hoc workouts on rest days or days without scheduled workouts

-- Create the client_adhoc_workouts table
CREATE TABLE IF NOT EXISTS client_adhoc_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workout_date DATE NOT NULL,
    name TEXT DEFAULT 'Custom Workout',
    workout_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups by client and date
CREATE INDEX IF NOT EXISTS idx_adhoc_workouts_client_date
ON client_adhoc_workouts(client_id, workout_date);

-- Create index for active workouts
CREATE INDEX IF NOT EXISTS idx_adhoc_workouts_active
ON client_adhoc_workouts(client_id, is_active) WHERE is_active = true;

-- Add unique constraint to prevent duplicate workouts on same date
ALTER TABLE client_adhoc_workouts
ADD CONSTRAINT unique_client_adhoc_date UNIQUE (client_id, workout_date);

-- Enable RLS
ALTER TABLE client_adhoc_workouts ENABLE ROW LEVEL SECURITY;

-- Policy: Clients can view their own ad-hoc workouts
CREATE POLICY "Clients can view own adhoc workouts" ON client_adhoc_workouts
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Clients can insert their own ad-hoc workouts
CREATE POLICY "Clients can create own adhoc workouts" ON client_adhoc_workouts
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT id FROM clients
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Clients can update their own ad-hoc workouts
CREATE POLICY "Clients can update own adhoc workouts" ON client_adhoc_workouts
    FOR UPDATE
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Clients can delete their own ad-hoc workouts
CREATE POLICY "Clients can delete own adhoc workouts" ON client_adhoc_workouts
    FOR DELETE
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Coaches can view ad-hoc workouts for their clients
CREATE POLICY "Coaches can view client adhoc workouts" ON client_adhoc_workouts
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE coach_id IN (
                SELECT id FROM coaches WHERE user_id = auth.uid()
            )
        )
    );

-- Policy: Service role has full access (for API functions)
CREATE POLICY "Service role full access" ON client_adhoc_workouts
    FOR ALL
    USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_adhoc_workout_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_adhoc_workout_timestamp
    BEFORE UPDATE ON client_adhoc_workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_adhoc_workout_timestamp();

-- Grant permissions
GRANT ALL ON client_adhoc_workouts TO authenticated;
GRANT ALL ON client_adhoc_workouts TO service_role;
