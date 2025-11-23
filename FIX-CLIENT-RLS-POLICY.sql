-- EMERGENCY FIX: Enable clients to view their own meal plans
-- Run this in your Supabase SQL Editor

-- Step 1: Drop existing client view policy if it exists
DROP POLICY IF EXISTS "Clients can view their own meal plans" ON coach_meal_plans;

-- Step 2: Recreate the policy with proper permissions
CREATE POLICY "Clients can view their own meal plans" ON coach_meal_plans
  FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- Step 3: Verify the policy was created
-- Run this SELECT to see all policies on coach_meal_plans:
-- SELECT * FROM pg_policies WHERE tablename = 'coach_meal_plans';

-- IMPORTANT: After running this, test by:
-- 1. Logging in as a client
-- 2. Checking if their plans show up on the dashboard
