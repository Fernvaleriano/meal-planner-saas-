-- IMMEDIATE FIX FOR COACHES TABLE RLS
-- Run this entire script in Supabase SQL Editor

-- Drop ALL existing policies on coaches table
DROP POLICY IF EXISTS "Coaches can view own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can insert own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can delete own profile" ON coaches;
DROP POLICY IF EXISTS "Allow signup to create coach record" ON coaches;
DROP POLICY IF EXISTS "Public read access" ON coaches;
DROP POLICY IF EXISTS "Authenticated users can insert" ON coaches;

-- Ensure RLS is enabled
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- CRITICAL: Grant permissions to the right roles
GRANT ALL ON coaches TO authenticated;
GRANT INSERT ON coaches TO anon;  -- For signup flow

-- Create simple, working policies
-- 1. Allow authenticated users to view their own profile
CREATE POLICY "authenticated_select_own"
ON coaches FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 2. Allow authenticated users to update their own profile
CREATE POLICY "authenticated_update_own"
ON coaches FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 3. Allow anon users to insert during signup
CREATE POLICY "anon_insert_signup"
ON coaches FOR INSERT
TO anon
WITH CHECK (true);

-- 4. Allow authenticated users to insert during signup (email confirmed case)
CREATE POLICY "authenticated_insert_signup"
ON coaches FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Verify policies were created
SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'coaches';
