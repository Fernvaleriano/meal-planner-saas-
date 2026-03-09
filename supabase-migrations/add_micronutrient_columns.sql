-- Add micronutrient columns to food_diary_entries
-- These columns were missing from the original schema, causing crashes when
-- the UI tried to read/write potassium, calcium, iron, vitamin_c, cholesterol

ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS potassium DECIMAL(7,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS calcium DECIMAL(7,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS iron DECIMAL(5,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS vitamin_c DECIMAL(6,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS cholesterol DECIMAL(6,1);

-- Add micronutrient goal columns to calorie_goals table
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS fiber_goal DECIMAL(5,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS sugar_goal DECIMAL(5,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS sodium_goal DECIMAL(7,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS potassium_goal DECIMAL(7,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS calcium_goal DECIMAL(7,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS iron_goal DECIMAL(5,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS vitamin_c_goal DECIMAL(6,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS cholesterol_goal DECIMAL(6,1);
