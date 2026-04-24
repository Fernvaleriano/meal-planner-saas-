-- Migration 003: Workout / exercise log dedup + uniqueness guards
--
-- History: on 2026-04-23 a duplicate-row race was producing "save, appears,
-- reverts on refresh" symptoms. The fix was a mix of client-side
-- serialization + a DB UNIQUE constraint on workout_logs(client_id, workout_date).
-- The workout_logs constraint was applied manually to production that day;
-- this file commits it to version control and ALSO adds the sibling
-- uniqueness guard on exercise_logs(workout_log_id, exercise_id) which was
-- flagged as the most likely remaining gap during the 2026-04-24 debugging
-- session — without it, a race can insert two exercise_log rows for the
-- same exercise under the same workout_log, and subsequent upserts pick
-- one while reads may return the other, producing the revert symptom even
-- with the workout_logs constraint in place.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Deduplicate existing workout_log rows per (client_id, workout_date).
--    Keep the survivor with the most exercise_logs (earliest created_at on tie).
--    Re-parent losers' exercise_logs onto the survivor before deleting them.
WITH ranked AS (
  SELECT
    wl.id,
    wl.client_id,
    wl.workout_date,
    wl.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY wl.client_id, wl.workout_date
      ORDER BY
        (SELECT COUNT(*) FROM exercise_logs el WHERE el.workout_log_id = wl.id) DESC,
        wl.created_at ASC
    ) AS rn
  FROM workout_logs wl
),
survivors AS (
  SELECT client_id, workout_date, id AS survivor_id
  FROM ranked WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, s.survivor_id
  FROM ranked r
  JOIN survivors s
    ON s.client_id = r.client_id AND s.workout_date = r.workout_date
  WHERE r.rn > 1
)
UPDATE exercise_logs el
SET workout_log_id = l.survivor_id
FROM losers l
WHERE el.workout_log_id = l.loser_id;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, workout_date
      ORDER BY
        (SELECT COUNT(*) FROM exercise_logs el WHERE el.workout_log_id = workout_logs.id) DESC,
        created_at ASC
    ) AS rn
  FROM workout_logs
)
DELETE FROM workout_logs WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Dedupe exercise_logs per (workout_log_id, exercise_id).
--    Keep the most recently created row. exercise_logs has no updated_at
--    column, so created_at is the best available recency signal (id desc
--    as tiebreaker on identical timestamps).
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_log_id, exercise_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM exercise_logs
  WHERE exercise_id IS NOT NULL
)
DELETE FROM exercise_logs WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Codify the invariant: one workout_log per client/day.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_client_date_unique'
  ) THEN
    ALTER TABLE workout_logs
      ADD CONSTRAINT workout_logs_client_date_unique UNIQUE (client_id, workout_date);
  END IF;
END $$;

-- 4. Codify the invariant: one exercise_log per workout_log per exercise.
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
