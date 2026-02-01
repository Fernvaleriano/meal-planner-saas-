-- Migration: Add is_club_workout flag to workout_programs
-- Purpose: Allow coaches to mark any workout program as a "Club Workout"
-- Club workouts are visible to all the coach's clients (not assigned, just available to browse)

ALTER TABLE workout_programs
ADD COLUMN IF NOT EXISTS is_club_workout BOOLEAN DEFAULT false;

-- Index for quickly finding club workouts by coach
CREATE INDEX IF NOT EXISTS idx_workout_programs_club ON workout_programs(coach_id, is_club_workout) WHERE is_club_workout = true;
