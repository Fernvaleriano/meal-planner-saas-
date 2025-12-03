-- Migration: Add archive and activity tracking fields to clients table
-- Run this in Supabase SQL Editor

-- Add is_archived field (default false for existing clients)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Add archived_at timestamp
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add last_activity_at timestamp for tracking client portal activity
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- Create index for filtering archived clients
CREATE INDEX IF NOT EXISTS idx_clients_is_archived ON clients(coach_id, is_archived);

-- Create index for last activity sorting
CREATE INDEX IF NOT EXISTS idx_clients_last_activity ON clients(last_activity_at);

-- Update existing clients to ensure is_archived is false
UPDATE clients SET is_archived = false WHERE is_archived IS NULL;

-- Comment for documentation
COMMENT ON COLUMN clients.is_archived IS 'Soft delete flag - archived clients retain basic info but related data is deleted';
COMMENT ON COLUMN clients.archived_at IS 'Timestamp when client was archived';
COMMENT ON COLUMN clients.last_activity_at IS 'Last time client accessed the portal';
