-- Migration: Add club_workouts table
-- Purpose: Allow coaches to create shared "Club Workouts" that any client can browse and use
-- These are NOT assigned to specific clients - they're a shared workout library

CREATE TABLE IF NOT EXISTS club_workouts (
    id SERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Workout details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- e.g. 'strength', 'cardio', 'hiit', 'mobility', 'full_body', etc.
    difficulty VARCHAR(20), -- beginner, intermediate, advanced

    -- The workout structure (same format as workout_data in assignments)
    -- Format: { exercises: [...], estimatedMinutes: 45, estimatedCalories: 300 }
    workout_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_club_workouts_coach ON club_workouts(coach_id);
CREATE INDEX IF NOT EXISTS idx_club_workouts_active ON club_workouts(coach_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_club_workouts_category ON club_workouts(category);

-- Enable RLS
ALTER TABLE club_workouts ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own club workouts
CREATE POLICY "Coaches can manage own club workouts" ON club_workouts
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view club workouts from their coach
CREATE POLICY "Clients can view coach club workouts" ON club_workouts
    FOR SELECT USING (
        coach_id IN (
            SELECT coach_id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Service role has full access (for API functions)
CREATE POLICY "Service role full access club workouts" ON club_workouts
    FOR ALL USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE TRIGGER update_club_workouts_timestamp
    BEFORE UPDATE ON club_workouts
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

-- Grant permissions
GRANT ALL ON club_workouts TO authenticated;
GRANT ALL ON club_workouts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE club_workouts_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE club_workouts_id_seq TO service_role;
