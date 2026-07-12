-- Migration: Gym Info — membership packages + facilities
-- Additive documentation only. `coaches.gym_info` is already a nullable JSONB
-- column (see 026_coaches_gym_info.sql); adding new optional keys needs no DDL.
--
-- Extends the gym-version "Gym Info" card with:
--   * packages  — membership price options (label + price), e.g. "1 Month" / "฿1,499"
--   * amenities — facility highlights shown as chips, e.g. "Boxing Zone", "Ice Bath"
--
-- Both are optional arrays. Existing rows without them render exactly as before
-- (the coach dashboard and member app both gate each block on data presence).

COMMENT ON COLUMN coaches.gym_info IS
  'Gym version: hours of operation, class schedule, membership packages, facilities, socials. Edited from the coach dashboard Gym Info card. NULL = never set (dashboard shows sensible defaults).';

-- Expected shape (all fields optional):
-- {
--   "hours": {
--     "mon": { "closed": false, "open": "06:00", "close": "22:00" },
--     ... one entry per day: mon,tue,wed,thu,fri,sat,sun
--   },
--   "classes": [
--     { "name": "Muay Thai", "schedule": "Wed & Fri 6–7 PM", "included": true }
--   ],
--   "packages": [
--     { "label": "1 Day Pass", "price": "฿349" },
--     { "label": "1 Month",    "price": "฿1,499" }
--   ],
--   "amenities": [ "Premium Equipment", "Boxing Zone", "Ice Bath Recovery" ],
--   "instagram": "@yourgym",
--   "phone": "",
--   "address": "",
--   "website": ""
-- }
