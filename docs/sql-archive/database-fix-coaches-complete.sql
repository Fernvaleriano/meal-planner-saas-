-- Complete fix for coaches table RLS policies
-- This script will diagnose and fix all RLS issues with the coaches table

-- First, let's verify the coaches table exists and check current policies
-- Run this section first to see what we're working with

-- Check if coaches table has RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'coaches';

-- View all current policies on coaches table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'coaches';

-- Check table permissions
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'coaches';

-- Now let's fix everything
-- Drop all existing policies
DROP POLICY IF EXISTS "Coaches can view own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can insert own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can delete own profile" ON coaches;

-- Enable RLS on coaches table (in case it's not enabled)
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- Grant table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON coaches TO anon;

-- Create policies for authenticated users ONLY
-- Policy: Allow coaches to view their own profile
CREATE POLICY "Coaches can view own profile"
ON coaches
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy: Allow coaches to update their own profile
CREATE POLICY "Coaches can update own profile"
ON coaches
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy: Allow coaches to insert their own profile (for signup)
CREATE POLICY "Coaches can insert own profile"
ON coaches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Policy: Allow anyone (anon) to insert during signup
CREATE POLICY "Allow signup to create coach record"
ON coaches
FOR INSERT
TO anon
WITH CHECK (true);

-- Verify the policies were created correctly
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'coaches';

-- Check a specific user's coach record (replace UUID with actual user ID to test)
-- SELECT * FROM coaches WHERE id = 'your-user-id-here';
