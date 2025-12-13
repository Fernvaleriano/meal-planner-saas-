-- Migration: Update exercises table for exercise library import
-- Adds new fields to support the exerciseanimatic.com data

-- ==============================================
-- ADD NEW COLUMNS TO EXERCISES TABLE
-- ==============================================

-- Category field (Bodyweight, Free Weights, Resistance)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Exercise tips (separate from instructions)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tips TEXT;

-- Primary muscles as text (includes scientific names)
-- e.g., "Chest (Pectoralis major), Shoulders (Deltoids), Triceps (Triceps brachii)"
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS primary_muscles TEXT;

-- Video URL for MP4 (Supabase Storage URL)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Gender variant (male, female, or null for unisex)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS gender_variant VARCHAR(10);

-- Source identifier for tracking where exercise data came from
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'exerciseanimatic';

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);

-- Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_exercises_source ON exercises(source);

-- ==============================================
-- NORMALIZE EQUIPMENT VALUES
-- ==============================================

-- Update any inconsistent casing in equipment
UPDATE exercises SET equipment = 'Smith Machine' WHERE LOWER(equipment) = 'smith machine';
UPDATE exercises SET equipment = 'None' WHERE LOWER(equipment) = 'none' OR equipment = 'None (Bodyweight)';
UPDATE exercises SET equipment = 'Dumbbell' WHERE equipment = 'Dumbbells';
UPDATE exercises SET equipment = 'EZ Bar' WHERE equipment = 'Ez Bar';
UPDATE exercises SET equipment = 'Leg Press Machine' WHERE LOWER(equipment) = 'leg press machine';
UPDATE exercises SET equipment = 'Chair' WHERE LOWER(equipment) = 'chair';
UPDATE exercises SET equipment = 'Weight Plate' WHERE LOWER(equipment) = 'weight plate';
UPDATE exercises SET equipment = 'Ab Roller' WHERE LOWER(equipment) = 'ab roller' OR LOWER(equipment) = 'ab wheel';

-- ==============================================
-- NORMALIZE CATEGORY VALUES
-- ==============================================

UPDATE exercises SET category = 'Bodyweight' WHERE LOWER(category) = 'bodyweight';

-- ==============================================
-- CREATE SUPABASE STORAGE BUCKET FOR EXERCISE VIDEOS
-- ==============================================

-- Note: Run this in Supabase Dashboard SQL Editor or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('exercise-videos', 'exercise-videos', true);

-- Storage policy to allow public read access (run in Supabase Dashboard):
-- CREATE POLICY "Public read access for exercise videos" ON storage.objects
--   FOR SELECT USING (bucket_id = 'exercise-videos');

-- Storage policy to allow authenticated uploads (run in Supabase Dashboard):
-- CREATE POLICY "Authenticated users can upload exercise videos" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'exercise-videos' AND auth.role() = 'authenticated');
