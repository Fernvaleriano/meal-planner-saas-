-- Fix RLS policies for coaches table
-- This ensures coaches can read and update their own records

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Coaches can view own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON coaches;

-- Allow coaches to view their own profile
CREATE POLICY "Coaches can view own profile" ON coaches
  FOR SELECT
  USING (auth.uid() = id);

-- Allow coaches to update their own profile
CREATE POLICY "Coaches can update own profile" ON coaches
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Note: This should fix the dashboard loading issue
-- Run this in Supabase SQL Editor and then refresh your dashboard
