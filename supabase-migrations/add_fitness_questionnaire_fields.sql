-- Add fitness questionnaire fields to clients table
-- These fields are collected during client intake but were not previously stored

ALTER TABLE clients ADD COLUMN IF NOT EXISTS fitness_level VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exercise_frequency VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS workout_duration VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS equipment_access VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exercise_types JSONB DEFAULT '[]';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_concerns TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fitness_goal_details TEXT;
