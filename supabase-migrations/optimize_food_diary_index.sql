-- Migration: Optimize Food Diary Query Performance
-- This index covers the full query pattern used when loading diary entries:
-- WHERE client_id = ? AND entry_date = ? ORDER BY meal_type, created_at
-- Without this index, PostgreSQL must load all matching rows and sort in-memory,
-- causing 4-7 second delays for users with many entries.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diary_full_query
ON food_diary_entries(client_id, entry_date, meal_type, created_at);
