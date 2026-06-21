-- 023_client_gym_equipment.sql
-- Adds a single JSONB column to store a client's photo-derived gym equipment.
--
-- Why one JSONB column (not several): gym equipment is a small, self-contained
-- bundle that is read/written together (the "Their Gym" drawer on the client
-- profile and the workout AI generator). Keeping it in one additive nullable
-- column is the minimum viable change and cannot break any existing read/write
-- path (no existing code references this column).
--
-- Shape stored in gym_equipment:
-- {
--   "items":      ["Adjustable dumbbells", "Flat bench", "All-in-one home gym (lat pulldown, chest press, leg extension)"],
--   "categories": ["dumbbell", "machine", "cable", "bodyweight"],   // tokens the workout AI filters on
--   "status":     "pending" | "approved",                          // coach must approve before plans use it
--   "photos":     [{ "url": "...", "path": "...", "uploadedAt": "2026-06-21T..." }],
--   "analyzedAt": "2026-06-21T...",
--   "approvedAt": "2026-06-21T..."
-- }
--
-- The categories array uses the SAME vocabulary the workout generator already
-- understands (barbell, dumbbell, cable, machine, bodyweight, kettlebell,
-- bands, pullup_bar) so it can be applied as the equipment filter directly.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gym_equipment JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.gym_equipment IS
  'Photo-derived home/gym equipment for this client: { items[], categories[], status, photos[], analyzedAt, approvedAt }. When status = approved, the workout AI uses categories[] as the equipment filter. Set via the "Their Gym" area on the client profile.';
