-- Migration: mark a coach account as a gym
-- ============================================================================
-- Adds a single boolean, `coaches.is_gym`. A gym account (an owner/manager who
-- runs a facility with members, optionally with trainers under them) is routed
-- on login to the gym dashboard (gym-dashboard.html) instead of the one-on-one
-- coaching dashboard. A regular personal-trainer account stays exactly as today.
--
-- SAFETY: purely additive, default FALSE. Every existing coach keeps is_gym =
-- false and sees no change. Reverting this column (or the routing code that
-- reads it) simply sends gyms back to the coaching dashboard — nothing breaks.
-- ============================================================================

ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS is_gym BOOLEAN DEFAULT false;

COMMENT ON COLUMN coaches.is_gym IS
    'When true, this account is a gym/facility owner and login routes it to '
    'gym-dashboard.html instead of dashboard.html. Default false = regular coach.';
