-- Add water intake preferences to clients table
-- Allows clients to customize their daily water goal and preferred unit

ALTER TABLE clients ADD COLUMN IF NOT EXISTS water_goal INTEGER DEFAULT 8;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS water_unit TEXT DEFAULT 'glasses';
