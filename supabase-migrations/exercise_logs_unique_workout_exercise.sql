-- Enforce one exercise_log row per workout session + exercise identity.
-- This prevents concurrent save paths from creating duplicate rows that can
-- cause stale data to be selected on read.

-- 1) Remove legacy duplicates, keeping the newest row by updated_at/id.
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
DELETE FROM exercise_logs e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

-- 2) Add uniqueness guardrail for future writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercise_logs_workout_log_id_exercise_id_key'
  ) THEN
    ALTER TABLE exercise_logs
      ADD CONSTRAINT exercise_logs_workout_log_id_exercise_id_key
      UNIQUE (workout_log_id, exercise_id);
  END IF;
END $$;
