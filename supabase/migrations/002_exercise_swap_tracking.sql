-- Track when a client substitutes an exercise so coaches can see the swap in the activity feed
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS swapped_from_name TEXT;
