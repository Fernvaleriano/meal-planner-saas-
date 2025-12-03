-- Security Fixes Migration
-- Fixes RLS issues identified by Supabase Security Advisor
-- Run this in your Supabase SQL Editor

-- =====================================================
-- 1. FIX: meal_plan_templates - RLS was disabled
-- =====================================================

-- Enable RLS on meal_plan_templates
ALTER TABLE meal_plan_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Coaches can view own templates" ON meal_plan_templates;
DROP POLICY IF EXISTS "Coaches can insert own templates" ON meal_plan_templates;
DROP POLICY IF EXISTS "Coaches can update own templates" ON meal_plan_templates;
DROP POLICY IF EXISTS "Coaches can delete own templates" ON meal_plan_templates;

-- Coaches can view their own templates
CREATE POLICY "Coaches can view own templates" ON meal_plan_templates
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can create their own templates
CREATE POLICY "Coaches can insert own templates" ON meal_plan_templates
    FOR INSERT WITH CHECK (coach_id = auth.uid());

-- Coaches can update their own templates
CREATE POLICY "Coaches can update own templates" ON meal_plan_templates
    FOR UPDATE USING (coach_id = auth.uid());

-- Coaches can delete their own templates
CREATE POLICY "Coaches can delete own templates" ON meal_plan_templates
    FOR DELETE USING (coach_id = auth.uid());

-- =====================================================
-- 2. Verify RLS is enabled on all user-facing tables
-- =====================================================

-- These should already have RLS but let's make sure
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coach_meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meal_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recipe_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS saved_custom_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplement_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplement_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_protocol_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checkin_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS calorie_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS food_diary_entries ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. Add missing policies for tables that may lack them
-- =====================================================

-- clients table policies (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Coaches can view own clients') THEN
        CREATE POLICY "Coaches can view own clients" ON clients
            FOR SELECT USING (coach_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Clients can view own record') THEN
        CREATE POLICY "Clients can view own record" ON clients
            FOR SELECT USING (user_id = auth.uid());
    END IF;
END $$;

-- coach_meal_plans policies (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_meal_plans' AND policyname = 'Coaches can manage own plans') THEN
        CREATE POLICY "Coaches can manage own plans" ON coach_meal_plans
            FOR ALL USING (coach_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_meal_plans' AND policyname = 'Clients can view assigned plans') THEN
        CREATE POLICY "Clients can view assigned plans" ON coach_meal_plans
            FOR SELECT USING (
                client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
            );
    END IF;
END $$;

-- =====================================================
-- 4. Ensure service role can bypass RLS (already default)
-- =====================================================
-- Note: Service role automatically bypasses RLS in Supabase
-- This is how Netlify Functions work with SUPABASE_SERVICE_KEY

-- =====================================================
-- 5. Grant necessary permissions
-- =====================================================

-- Ensure authenticated users can access tables through RLS policies
GRANT SELECT, INSERT, UPDATE, DELETE ON meal_plan_templates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE meal_plan_templates_id_seq TO authenticated;

-- =====================================================
-- VERIFICATION: Run this to check RLS status
-- =====================================================
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
