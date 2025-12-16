-- Migration: Fix Supabase Security Advisor Warnings
-- Fixes:
-- 1. Function Search Path Mutable for update_gym_updated_at()
-- 2. Function Search Path Mutable for enable_gym_features_for_email()
-- 3. Security Definer View for exercise_history

-- ==============================================
-- FIX 1: update_gym_updated_at() - Add fixed search_path
-- ==============================================

CREATE OR REPLACE FUNCTION update_gym_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ==============================================
-- FIX 2: enable_gym_features_for_email() - Add fixed search_path
-- This function needs SECURITY DEFINER to access auth.users
-- but must have a fixed search_path to be secure
-- ==============================================

CREATE OR REPLACE FUNCTION enable_gym_features_for_email(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID from auth.users by email
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NOT NULL THEN
        -- Insert or update coach_settings
        INSERT INTO coach_settings (coach_id, gym_features_enabled)
        VALUES (target_user_id, true)
        ON CONFLICT (coach_id)
        DO UPDATE SET gym_features_enabled = true, updated_at = NOW();
    END IF;
END;
$$;

-- ==============================================
-- FIX 3: exercise_history view - Use SECURITY INVOKER
-- Drop and recreate with security_invoker property
-- ==============================================

DROP VIEW IF EXISTS exercise_history;

CREATE VIEW exercise_history
WITH (security_invoker = true)
AS
SELECT
    el.id,
    el.exercise_id,
    el.exercise_name,
    el.sets_data,
    el.total_sets,
    el.total_reps,
    el.total_volume,
    el.max_weight,
    el.is_pr,
    wl.workout_date,
    wl.client_id,
    wl.coach_id
FROM exercise_logs el
JOIN workout_logs wl ON el.workout_log_id = wl.id
ORDER BY wl.workout_date DESC;

-- Grant appropriate permissions on the view
GRANT SELECT ON exercise_history TO authenticated;
