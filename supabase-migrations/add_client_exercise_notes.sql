-- Add client notes and voice note support to exercise_logs
-- Separate from coach notes (which come from workout program data)

ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS client_notes TEXT;
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS client_voice_note_path TEXT;

-- Index for quick lookups of exercises that have client notes (for coach feed)
CREATE INDEX IF NOT EXISTS idx_exercise_logs_client_notes
  ON exercise_logs(workout_log_id)
  WHERE client_notes IS NOT NULL OR client_voice_note_path IS NOT NULL;
