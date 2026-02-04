-- Migration: Add Workout Notes to Priority Dashboard
-- This migration:
-- 1. Creates the dismissed_activity_items table if it doesn't exist (fixes 500 error)
-- 2. Adds workout_note as a valid reason type
-- 3. Adds item_type column for better tracking
-- 4. Creates necessary indexes for workout notes queries

-- =============================================================================
-- STEP 1: Create dismissed_activity_items table (if not exists)
-- =============================================================================
-- This table tracks which activity items coaches have marked as "done" or archived
-- If this table is missing, the dashboard will crash with a 500 error

CREATE TABLE IF NOT EXISTS dismissed_activity_items (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
    -- Reason types: 'diet_request', 'high_stress', 'low_energy', 'low_adherence',
    --               'inactive', 'pending_checkin', 'expiring_plan', 'client_pr', 'workout_note'
    reason VARCHAR(50) NOT NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Optional: reference to the specific check-in that triggered this item
    related_checkin_id BIGINT REFERENCES client_checkins(id) ON DELETE SET NULL,
    -- Optional: reference to exercise_log for workout notes
    related_exercise_log_id INTEGER REFERENCES exercise_logs(id) ON DELETE SET NULL,
    -- Optional notes from coach when dismissing
    notes TEXT,
    -- Item type for better categorization (checkin, workout_note, meal_plan, pr, etc.)
    item_type VARCHAR(50),
    -- Pinning feature
    is_pinned BOOLEAN DEFAULT FALSE,
    pinned_at TIMESTAMP WITH TIME ZONE,
    -- Composite unique constraint to prevent duplicate dismissals
    CONSTRAINT unique_dismissal UNIQUE (coach_id, client_id, reason, related_checkin_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_coach_id ON dismissed_activity_items(coach_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_client_id ON dismissed_activity_items(client_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_dismissed_at ON dismissed_activity_items(dismissed_at);
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_item_type ON dismissed_activity_items(item_type);
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_exercise_log ON dismissed_activity_items(related_exercise_log_id);

-- Enable Row Level Security
ALTER TABLE dismissed_activity_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Coaches can view own dismissals" ON dismissed_activity_items;
DROP POLICY IF EXISTS "Coaches can insert own dismissals" ON dismissed_activity_items;
DROP POLICY IF EXISTS "Coaches can delete own dismissals" ON dismissed_activity_items;
DROP POLICY IF EXISTS "Coaches can update own dismissals" ON dismissed_activity_items;

-- Policy: Coaches can only view their own dismissed items
CREATE POLICY "Coaches can view own dismissals" ON dismissed_activity_items
    FOR SELECT
    USING (auth.uid() = coach_id);

-- Policy: Coaches can insert their own dismissals
CREATE POLICY "Coaches can insert own dismissals" ON dismissed_activity_items
    FOR INSERT
    WITH CHECK (auth.uid() = coach_id);

-- Policy: Coaches can delete their own dismissals (to "un-dismiss" an item)
CREATE POLICY "Coaches can delete own dismissals" ON dismissed_activity_items
    FOR DELETE
    USING (auth.uid() = coach_id);

-- Policy: Coaches can update their own dismissals (for pinning)
CREATE POLICY "Coaches can update own dismissals" ON dismissed_activity_items
    FOR UPDATE
    USING (auth.uid() = coach_id);

-- =============================================================================
-- STEP 2: Add columns to dismissed_activity_items if table already existed
-- =============================================================================
-- These ALTER statements are safe to run even if the columns already exist

-- Add is_pinned column if it doesn't exist
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Add pinned_at column if it doesn't exist
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Add item_type column if it doesn't exist
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50);

-- Add related_exercise_log_id column if it doesn't exist
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS related_exercise_log_id INTEGER REFERENCES exercise_logs(id) ON DELETE SET NULL;

-- =============================================================================
-- STEP 3: Create index on exercise_logs for quick workout notes lookup
-- =============================================================================
-- This index helps the dashboard quickly find exercises with client notes

CREATE INDEX IF NOT EXISTS idx_exercise_logs_with_notes
    ON exercise_logs(workout_log_id, created_at DESC)
    WHERE client_notes IS NOT NULL OR client_voice_note_path IS NOT NULL;

-- =============================================================================
-- STEP 4: Add comments for documentation
-- =============================================================================
COMMENT ON TABLE dismissed_activity_items IS 'Tracks activity items that coaches have marked as addressed/done on their dashboard';
COMMENT ON COLUMN dismissed_activity_items.reason IS 'The type of activity: diet_request, high_stress, low_energy, low_adherence, inactive, pending_checkin, expiring_plan, client_pr, workout_note';
COMMENT ON COLUMN dismissed_activity_items.item_type IS 'Category of item: checkin, workout_note, meal_plan, pr, etc.';
COMMENT ON COLUMN dismissed_activity_items.related_exercise_log_id IS 'Reference to exercise_logs for workout notes';
