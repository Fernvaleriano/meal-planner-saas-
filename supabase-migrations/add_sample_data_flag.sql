-- Migration: Add is_sample flag to clients table
-- Used to identify sample/demo clients created for new coaches during free trial

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT false;

-- Index for quick lookups when checking if sample data already exists
CREATE INDEX IF NOT EXISTS idx_clients_is_sample ON clients(coach_id) WHERE is_sample = true;
