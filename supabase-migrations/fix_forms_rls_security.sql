-- Migration: Fix RLS Security for Form Tables
-- Fixes Supabase Security Advisor Errors:
-- 1. Policy Exists RLS Disabled - public.form_responses
-- 2. RLS Disabled in Public - public.form_templates
-- 3. RLS Disabled in Public - public.form_responses

-- ==============================================
-- ENABLE ROW LEVEL SECURITY ON FORM TABLES
-- ==============================================

-- Enable RLS on form_templates
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

-- Enable RLS on form_responses
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- RECREATE RLS POLICIES (drop first to avoid conflicts)
-- ==============================================

-- Form Templates Policies
DROP POLICY IF EXISTS "Coaches can manage their own form templates" ON form_templates;
DROP POLICY IF EXISTS "Anyone can read active form templates" ON form_templates;

CREATE POLICY "Coaches can manage their own form templates"
    ON form_templates
    FOR ALL
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Anyone can read active form templates"
    ON form_templates
    FOR SELECT
    USING (is_active = true);

-- Form Responses Policies
DROP POLICY IF EXISTS "Coaches can read their form responses" ON form_responses;
DROP POLICY IF EXISTS "Coaches can update their form responses" ON form_responses;
DROP POLICY IF EXISTS "Anyone can submit form responses" ON form_responses;
DROP POLICY IF EXISTS "Authenticated users can read form responses" ON form_responses;
DROP POLICY IF EXISTS "Authenticated users can update form responses" ON form_responses;

CREATE POLICY "Coaches can read their form responses"
    ON form_responses
    FOR SELECT
    USING (
        form_template_id IN (
            SELECT id FROM form_templates WHERE coach_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can update their form responses"
    ON form_responses
    FOR UPDATE
    USING (
        form_template_id IN (
            SELECT id FROM form_templates WHERE coach_id = auth.uid()
        )
    );

-- Anyone can submit form responses (public form submission)
CREATE POLICY "Anyone can submit form responses"
    ON form_responses
    FOR INSERT
    WITH CHECK (true);

-- ==============================================
-- VERIFICATION QUERIES (run these to verify fix)
-- ==============================================
-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('form_templates', 'form_responses');
--
-- Check policies exist:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('form_templates', 'form_responses');
