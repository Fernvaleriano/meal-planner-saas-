-- Migration: Add archived and last_online columns to clients table
-- Run this in Supabase SQL editor

-- Add archived column (default false for existing clients)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Add archived_at timestamp
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add last_online timestamp to track when client was last active
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS last_online TIMESTAMPTZ;

-- Create index for archived status (for filtering)
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(archived);

-- Create index for coach_id + archived combo (common query pattern)
CREATE INDEX IF NOT EXISTS idx_clients_coach_archived ON clients(coach_id, archived);

-- Comment on columns for documentation
COMMENT ON COLUMN clients.archived IS 'Whether the client has been archived by the coach';
COMMENT ON COLUMN clients.archived_at IS 'When the client was archived';
COMMENT ON COLUMN clients.last_online IS 'Last time the client accessed the portal';
