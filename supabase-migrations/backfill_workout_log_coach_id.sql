-- Backfill workout_logs that have NULL coach_id
-- by looking up the coach_id from the client record.
-- This ensures RLS policies work correctly for coach dashboard queries.

UPDATE workout_logs wl
SET coach_id = c.coach_id
FROM clients c
WHERE wl.client_id = c.id
  AND wl.coach_id IS NULL
  AND c.coach_id IS NOT NULL;
