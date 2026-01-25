-- Add coaching fields to exercises table
-- These fields store curated, manual content for each exercise

-- Form tips: Key points for proper form (array of strings)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS form_tips JSONB DEFAULT '[]'::jsonb;

-- Common mistakes: What to avoid (array of strings)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS common_mistakes JSONB DEFAULT '[]'::jsonb;

-- Coaching cues: Short 2-3 word reminders during sets (array of strings)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS coaching_cues JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN exercises.form_tips IS 'Array of form tip strings, e.g., ["Keep back straight", "Drive through heels"]';
COMMENT ON COLUMN exercises.common_mistakes IS 'Array of common mistake strings, e.g., ["Rounding lower back", "Knees caving in"]';
COMMENT ON COLUMN exercises.coaching_cues IS 'Array of short coaching cue strings, e.g., ["Chest up", "Squeeze at top"]';

-- Example of what populated data looks like:
-- UPDATE exercises SET
--   form_tips = '["Keep your back straight throughout the movement", "Drive through your heels, not your toes", "Keep knees tracking over toes"]',
--   common_mistakes = '["Rounding the lower back", "Knees caving inward", "Rising onto toes at the bottom"]',
--   coaching_cues = '["Chest up", "Brace core", "Squeeze glutes"]'
-- WHERE name = 'Barbell Squat';
