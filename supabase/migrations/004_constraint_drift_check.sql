-- Migration 004: RPC function for runtime constraint drift detection
--
-- Companion to 003_workout_logs_dedup.sql. The constraints added there
-- protect against the duplicate-row race that produced the "save, appears,
-- reverts" bug. This migration adds a tiny SECURITY DEFINER function so
-- the workout-logs Netlify function can verify on cold start that the
-- constraints are still in place — if anything ever drops them (manual
-- DDL, restore from old backup, project import), the function logs a
-- CRITICAL error to Netlify function logs immediately instead of letting
-- the bug silently resurface.
--
-- The function is read-only and only returns a boolean per constraint.
-- SECURITY DEFINER lets the service role call it without needing direct
-- pg_catalog read grants.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.check_workout_log_constraints()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'workout_logs_client_date_unique', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_client_date_unique'
    ),
    'exercise_logs_workout_exercise_unique', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'exercise_logs_workout_exercise_unique'
    )
  );
$$;

-- Allow the service role to call the function. It's already owned by postgres
-- and SECURITY DEFINER, but explicit grant makes intent clear and survives
-- role permission audits.
GRANT EXECUTE ON FUNCTION public.check_workout_log_constraints() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_workout_log_constraints() TO authenticated;
