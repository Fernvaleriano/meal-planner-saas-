-- Add micronutrient columns to food_diary_entries table
-- These columns were missing from the original schema

ALTER TABLE food_diary_entries
ADD COLUMN IF NOT EXISTS potassium DECIMAL(6,1),
ADD COLUMN IF NOT EXISTS calcium DECIMAL(6,1),
ADD COLUMN IF NOT EXISTS iron DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS vitamin_c DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS cholesterol DECIMAL(6,1);

-- Add comment explaining the columns
COMMENT ON COLUMN food_diary_entries.potassium IS 'Potassium in mg';
COMMENT ON COLUMN food_diary_entries.calcium IS 'Calcium in mg';
COMMENT ON COLUMN food_diary_entries.iron IS 'Iron in mg';
COMMENT ON COLUMN food_diary_entries.vitamin_c IS 'Vitamin C in mg';
COMMENT ON COLUMN food_diary_entries.cholesterol IS 'Cholesterol in mg';
