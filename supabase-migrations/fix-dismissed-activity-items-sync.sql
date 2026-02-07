-- Fix: Cross-device sync for coach dashboard priority checkboxes
--
-- Problem: related_checkin_id had a FOREIGN KEY to client_checkins(id), but the code
-- stores IDs from many different tables (notifications for PRs, coach_meal_plans for
-- expiring plans, exercise_logs for workout notes, clients for ghost clients, and
-- strings for plateau alerts). The FK constraint caused INSERT failures for all
-- non-checkin alert types, so dismissals only persisted in localStorage (device-specific).
--
-- Fix: Drop the FK constraint and change the column type to TEXT so it can store
-- any identifier (integer IDs from various tables, or string identifiers like plateau keys).

-- Step 1: Drop the foreign key constraint
ALTER TABLE dismissed_activity_items
  DROP CONSTRAINT IF EXISTS dismissed_activity_items_related_checkin_id_fkey;

-- Step 2: Change column type from BIGINT to TEXT to support string identifiers
-- Existing integer values cast cleanly to TEXT strings (e.g., 123 → '123')
ALTER TABLE dismissed_activity_items
  ALTER COLUMN related_checkin_id TYPE TEXT USING related_checkin_id::TEXT;
