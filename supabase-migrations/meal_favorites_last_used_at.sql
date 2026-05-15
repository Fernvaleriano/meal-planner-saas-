-- Add last_used_at to meal_favorites for "most recently used" ordering
-- When a client logs a favorite to their diary, last_used_at is bumped so
-- the favorite moves to the top of the Favorites list. Favorites that have
-- never been logged fall back to created_at for ordering.

ALTER TABLE meal_favorites
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;

-- Speeds up the per-client recency sort (most recently used first)
CREATE INDEX IF NOT EXISTS idx_meal_favorites_client_recency
  ON meal_favorites (client_id, COALESCE(last_used_at, created_at) DESC);
