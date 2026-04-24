-- Migration 003: Workout logs deduplication + uniqueness guard
--
-- Applied manually to production on 2026-04-23 during the "save shows up
-- then reverts" incident. Committing here so any fresh Supabase environment
-- (staging, local dev, new project) gets the same guarantee without having
-- to remember the back story.
--
-- Bug context
-- -----------
-- The client app could race-create two workout_log rows for the same
-- (client_id, workout_date) when multiple exercise modals saved nearly
-- simultaneously. Subsequent exercise_log writes landed on one of the two
-- rows; the GET on page mount returned `logs[0]` which was often the
-- *other* (empty) row, so the UI merged the empty log over the template
-- and the user saw their reps/weight "revert" on refresh.
--
-- Fix is two parts:
--   1. Deduplicate any existing workout_log rows per (client_id, workout_date),
--      keeping the one with the most exercise_logs (falls back to earliest
--      created_at on tie). Re-parent exercise_logs from deleted dupes onto
--      the survivor so no logged data is lost.
--   2. Enforce the invariant at the DB layer via a UNIQUE constraint so
--      Postgres itself refuses a second row — client-side serialization is
--      the fast path, this constraint is the safety net.
--
-- Idempotent: safe to re-run. Guarded with IF NOT EXISTS / IF EXISTS.

BEGIN;

-- 1. Deduplicate existing rows.
--    For each (client_id, workout_date) with >1 row, pick the survivor
--    (most exercise_logs, earliest created_at on tie). Re-point the
--    losers' exercise_logs at the survivor, then delete the losers.
WITH ranked AS (
  SELECT
    wl.id,
    wl.client_id,
    wl.workout_date,
    wl.created_at,
    (SELECT COUNT(*) FROM exercise_logs el WHERE el.workout_log_id = wl.id) AS ex_count,
    ROW_NUMBER() OVER (
      PARTITION BY wl.client_id, wl.workout_date
      ORDER BY
        (SELECT COUNT(*) FROM exercise_logs el2 WHERE el2.workout_log_id = wl.id) DESC,
        wl.created_at ASC
    ) AS rn
  FROM workout_logs wl
),
survivors AS (
  SELECT client_id, workout_date, id AS survivor_id
  FROM ranked
  WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, s.survivor_id
  FROM ranked r
  JOIN survivors s
    ON s.client_id = r.client_id
   AND s.workout_date = r.workout_date
  WHERE r.rn > 1
)
UPDATE exercise_logs el
SET workout_log_id = l.survivor_id
FROM losers l
WHERE el.workout_log_id = l.loser_id;

-- Delete the losers now that their exercise_logs are re-parented.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, workout_date
      ORDER BY
        (SELECT COUNT(*) FROM exercise_logs el WHERE el.workout_log_id = workout_logs.id) DESC,
        created_at ASC
    ) AS rn
  FROM workout_logs
)
DELETE FROM workout_logs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Dedupe exercise_logs within a workout_log per exercise_id (same race,
--    different table). Keep the one with the most recent updated_at (or
--    id desc on tie).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_log_id, exercise_id
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM exercise_logs
  WHERE exercise_id IS NOT NULL
)
DELETE FROM exercise_logs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Add the unique constraint that prevents the bug from ever recurring
--    at the DB level, even if a future client-side code change reintroduces
--    the race.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_client_date_unique'
  ) THEN
    ALTER TABLE workout_logs
      ADD CONSTRAINT workout_logs_client_date_unique UNIQUE (client_id, workout_date);
  END IF;
END $$;

-- 4. Same one-row-per (workout_log_id, exercise_id) guard on exercise_logs.
--    This one the client upserts into already, so the constraint codifies
--    the invariant that's already been true for safe writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_logs_workout_exercise_unique'
  ) THEN
    ALTER TABLE exercise_logs
      ADD CONSTRAINT exercise_logs_workout_exercise_unique UNIQUE (workout_log_id, exercise_id);
  END IF;
END $$;

COMMIT;
