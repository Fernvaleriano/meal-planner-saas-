-- Add reference_links field to exercises table
-- Allows coaches to attach external resource links (YouTube, Instagram, articles, etc.) to exercises

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS reference_links JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN exercises.reference_links IS 'Array of reference link objects, e.g., [{"url": "https://youtube.com/...", "title": "Form Guide", "type": "youtube"}]';

-- Example of what populated data looks like:
-- UPDATE exercises SET
--   reference_links = '[
--     {"url": "https://www.youtube.com/watch?v=example", "title": "Squat Form Guide", "type": "youtube"},
--     {"url": "https://www.instagram.com/p/example", "title": "Coach Demo", "type": "instagram"}
--   ]'
-- WHERE name = 'Barbell Squat';
