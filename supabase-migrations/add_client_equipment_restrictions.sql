-- Migration: Add unavailable_equipment column to clients table
-- Stores a JSONB array of equipment names the client does NOT have access to.
-- Used to alert coaches when assigning workouts that include restricted equipment.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS unavailable_equipment JSONB DEFAULT '[]'::jsonb;
