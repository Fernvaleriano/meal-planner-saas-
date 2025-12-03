-- Add can_edit_goals permission column to clients table
-- This allows coaches to control whether clients can edit their own calorie/macro goals

ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_edit_goals BOOLEAN DEFAULT false;

-- Update existing clients to default to false (coach controls goals)
UPDATE clients SET can_edit_goals = false WHERE can_edit_goals IS NULL;
