-- Add can_edit_micronutrient_goals permission column to clients table
-- This allows coaches to control whether clients can edit their own micronutrient goals

ALTER TABLE clients ADD COLUMN IF NOT EXISTS can_edit_micronutrient_goals BOOLEAN DEFAULT false;

-- Update existing clients to default to false (coach controls micronutrient goals)
UPDATE clients SET can_edit_micronutrient_goals = false WHERE can_edit_micronutrient_goals IS NULL;
