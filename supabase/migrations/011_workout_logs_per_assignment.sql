-- Migration 011: allow multiple workout_logs per (client, date) when they
-- belong to DIFFERENT assignments.
--
-- Background: migration 003 added UNIQUE(client_id, workout_date) on
-- workout_logs to fix the "save shows up then reverts" duplicate-row bug.
-- That constraint encoded an assumption — one workout per client per day —
-- that does not hold in practice. A client can have two distinct assignments
-- land on the same date (e.g. press day + leg day from the same powerlifting
-- program, when one gets moved). With the single constraint, the second
-- workout's log POST resolves to the first's row, sets bleed across both,
-- and "Load Next Exercise" can't tell which workout it's in.
--
-- Fix: replace the single constraint with two partial unique indexes that
-- distinguish assigned and adhoc workouts:
--   • Assigned   → unique per (client_id, workout_date, assignment_id)
--   • Adhoc      → unique per (client_id, workout_date)  [assignment_id IS NULL]
--
-- This preserves the original dedup guarantee for each "slot" (you still
-- can't double-create a log for the same assignment, and still can't
-- double-create an adhoc log on the same date) while letting two different
-- assignments coexist on the same day with their own logs.
--
-- The companion RPC check_workout_log_constraints() (migration 004) is
-- updated below so the runtime drift detector knows about the new index
-- names.
--
-- Idempotent.

BEGIN;

-- Drop the too-narrow constraint added in 003. Use IF EXISTS so the
-- migration is re-runnable.
ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_client_date_unique;

-- Assigned workouts: one log per (client, date, assignment_id). Two
-- assignments on the same day now coexist because their assignment_ids
-- differ.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_client_date_assignment_unique
  ON public.workout_logs (client_id, workout_date, assignment_id)
  WHERE assignment_id IS NOT NULL;

-- Adhoc / unassigned workouts: still one per (client, date). Without this
-- partial index, NULL assignment_ids would never compare equal and adhoc
-- dupes could slip in.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_client_date_adhoc_unique
  ON public.workout_logs (client_id, workout_date)
  WHERE assignment_id IS NULL;

-- Refresh the drift-detector RPC so cold-start checks pass against the new
-- index names. Returns true for `workout_logs_client_date_unique` when
-- EITHER of the new partial indexes exists — keeps the JSON shape stable so
-- the Netlify function check at workout-logs.js doesn't need to change.
CREATE OR REPLACE FUNCTION public.check_workout_log_constraints()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'workout_logs_client_date_unique', EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'workout_logs'
        AND indexname IN (
          'workout_logs_client_date_assignment_unique',
          'workout_logs_client_date_adhoc_unique'
        )
    ),
    'exercise_logs_workout_exercise_unique', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'exercise_logs_workout_exercise_unique'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_workout_log_constraints() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_workout_log_constraints() TO authenticated;

COMMIT;
