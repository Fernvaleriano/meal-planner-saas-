-- Add client meal plan permission columns
-- These allow coaches to control what clients can do with their meal plans

-- Permission to use the "Change" button to swap meals for alternatives
ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_change_meals BOOLEAN DEFAULT true;

-- Permission to use the "Revise" button to modify meal details
ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_revise_meals BOOLEAN DEFAULT true;

-- Permission to use the "Custom" button to create custom meals
ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_custom_meals BOOLEAN DEFAULT true;

-- Permission to request a new meal plan from the coach
ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_request_new_plan BOOLEAN DEFAULT true;

-- Set defaults for existing clients (all permissions enabled by default)
UPDATE clients SET
    can_change_meals = true,
    can_revise_meals = true,
    can_custom_meals = true,
    can_request_new_plan = true
WHERE can_change_meals IS NULL;

-- Create table for tracking dismissed activity items
-- This allows coaches to mark activity items as "done" or "addressed"
CREATE TABLE IF NOT EXISTS dismissed_activity_items (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL, -- 'diet_request', 'high_stress', 'low_energy', 'low_adherence', 'inactive'
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Optional: reference to the specific check-in that triggered this item
    related_checkin_id BIGINT REFERENCES client_checkins(id) ON DELETE SET NULL,
    -- Optional notes from coach when dismissing
    notes TEXT,
    -- Composite unique constraint to prevent duplicate dismissals
    CONSTRAINT unique_dismissal UNIQUE (coach_id, client_id, reason, related_checkin_id)
);

-- Create index for faster lookups by coach
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_coach_id ON dismissed_activity_items(coach_id);

-- Create index for lookups by client
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_client_id ON dismissed_activity_items(client_id);

-- Create index for cleanup of old dismissals
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_dismissed_at ON dismissed_activity_items(dismissed_at);

-- Enable Row Level Security
ALTER TABLE dismissed_activity_items ENABLE ROW LEVEL SECURITY;

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

-- Add comment for documentation
COMMENT ON TABLE dismissed_activity_items IS 'Tracks activity items that coaches have marked as addressed/done on their dashboard';
COMMENT ON COLUMN dismissed_activity_items.reason IS 'The type of activity: diet_request, high_stress, low_energy, low_adherence, inactive';
