-- Add user account fields to clients table for client portal
-- This allows clients to register and log in to view their meal plans

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster user_id lookups
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

-- Update RLS policies to allow clients to view their own data
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Clients can view their own profile" ON clients;
DROP POLICY IF EXISTS "Clients can update their own profile" ON clients;

-- Policy: Coaches can manage their clients (existing functionality)
CREATE POLICY "Coaches can manage their clients" ON clients
  FOR ALL
  USING (coach_id = auth.uid());

-- Policy: Clients can view their own profile
CREATE POLICY "Clients can view their own profile" ON clients
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Clients can update their own profile (basic fields only)
CREATE POLICY "Clients can update their own profile" ON clients
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Update RLS policies for meal plans - allow clients to view their plans
DROP POLICY IF EXISTS "Clients can view their own meal plans" ON coach_meal_plans;

CREATE POLICY "Clients can view their own meal plans" ON coach_meal_plans
  FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- Note: Existing coach policies remain unchanged
-- Coaches retain full control over their clients and meal plans
