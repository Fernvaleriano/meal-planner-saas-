-- Migration: Add is_demo flag to clients table
-- Used to identify the coach's personal demo client used for showcasing the
-- platform during sales/marketing demos. Distinct from is_sample, which
-- marks built-in onboarding sample clients.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Index for quick lookups when seeding/resetting demo data
CREATE INDEX IF NOT EXISTS idx_clients_is_demo ON clients(coach_id) WHERE is_demo = true;

COMMENT ON COLUMN clients.is_demo IS 'Marks a client as a demo client used for showcasing the platform. Demo data can be reset/regenerated via the seed-demo-client function.';
