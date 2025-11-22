-- Database schema for client profiles
-- Allows coaches to manage their client roster and associate meal plans with clients

-- Create table for clients
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  notes TEXT,
  default_dietary_restrictions JSONB DEFAULT '[]'::jsonb,
  default_goal VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on coach_id for faster queries
CREATE INDEX idx_clients_coach_id ON clients(coach_id);

-- Create index on client_name for searching
CREATE INDEX idx_clients_name ON clients(client_name);

-- Create index on created_at for sorting
CREATE INDEX idx_clients_created_at ON clients(created_at DESC);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can only view their own clients
CREATE POLICY "Coaches can view own clients" ON clients
  FOR SELECT
  USING (auth.uid() = coach_id);

-- Policy: Coaches can insert their own clients
CREATE POLICY "Coaches can insert own clients" ON clients
  FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

-- Policy: Coaches can update their own clients
CREATE POLICY "Coaches can update own clients" ON clients
  FOR UPDATE
  USING (auth.uid() = coach_id);

-- Policy: Coaches can delete their own clients
CREATE POLICY "Coaches can delete own clients" ON clients
  FOR DELETE
  USING (auth.uid() = coach_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at();

-- Add client_id column to coach_meal_plans table to link plans to clients
-- This allows us to query all meal plans for a specific client
ALTER TABLE coach_meal_plans
  ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL;

-- Create index on client_id for faster queries
CREATE INDEX IF NOT EXISTS idx_coach_meal_plans_client_id ON coach_meal_plans(client_id);
