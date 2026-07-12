-- Migration: Drop the per-date unique constraint on client_adhoc_workouts
-- Purpose: Allow multiple ad-hoc workouts to coexist on the same date.
--
-- Background:
--   client_adhoc_workouts originally carried
--     unique_client_adhoc_date UNIQUE (client_id, workout_date)
--   which allowed exactly ONE ad-hoc workout per client per day.
--
--   The application layer has since moved to a multi-workout-per-date model:
--     * netlify/functions/adhoc-workouts.js (POST) only replaces a SAME-NAMED
--       workout on a given date and otherwise INSERTS a new row, so a client
--       can have (e.g.) a club workout + an AI-generated workout on one day.
--     * netlify/functions/workout-assignments.js reads ALL active ad-hoc rows
--       for a date and returns them as separate assignments.
--
--   The leftover unique constraint contradicted that design: as soon as a
--   client had any workout for a date, generating a differently-named
--   AI workout for the same date failed with
--     "duplicate key value violates unique constraint unique_client_adhoc_date".
--
-- Idempotency of same-named saves is preserved in the app layer (the POST
-- handler updates the existing same-named row in place), so no unique index
-- is needed at the DB level.

ALTER TABLE client_adhoc_workouts
DROP CONSTRAINT IF EXISTS unique_client_adhoc_date;
