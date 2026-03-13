-- Migration: Add intake token columns to clients table
-- This enables the client self-registration flow via intake forms
-- Run this migration in Supabase SQL Editor

-- Add intake token columns
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS intake_token VARCHAR(64),
ADD COLUMN IF NOT EXISTS intake_token_expires_at TIMESTAMPTZ;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_clients_intake_token ON clients(intake_token) WHERE intake_token IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN clients.intake_token IS 'Secure token for client intake form registration. Cleared after use.';
COMMENT ON COLUMN clients.intake_token_expires_at IS 'Expiration timestamp for the intake token. Default 7 days from creation.';
