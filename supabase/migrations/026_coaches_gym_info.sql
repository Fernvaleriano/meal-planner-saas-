-- Migration: Gym Info (hours of operation, class schedule, socials)
-- Adds a single additive, nullable JSONB column to `coaches`.
--
-- This backs the "Gym Info" card on the coach dashboard (gym version of the
-- app). A gym owner edits hours/days open, their free member classes
-- (e.g. Zumba, Muay Thai), and socials (Instagram, phone, address, website).
--
-- Safe / additive:
--   * Nullable, no default -> existing rows are untouched (NULL).
--   * NULL is treated by the dashboard as "never set" and shown as
--     sensible example defaults, so the card is never blank.
--   * Written by the coach directly under the existing
--     "Coaches can update own data" RLS policy (auth.uid() = id) — no new
--     policy or backend function required.

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS gym_info JSONB;

COMMENT ON COLUMN coaches.gym_info IS
  'Gym version: hours of operation, class schedule, socials. Edited from the coach dashboard Gym Info card. NULL = never set (dashboard shows sensible defaults).';

-- Expected shape (all fields optional):
-- {
--   "hours": {
--     "mon": { "closed": false, "open": "06:00", "close": "22:00" },
--     ... one entry per day: mon,tue,wed,thu,fri,sat,sun
--   },
--   "classes": [
--     { "name": "Zumba",     "schedule": "Twice a week", "included": true },
--     { "name": "Muay Thai", "schedule": "Twice a week", "included": true }
--   ],
--   "instagram": "@yourgym",
--   "phone": "",
--   "address": "",
--   "website": ""
-- }
