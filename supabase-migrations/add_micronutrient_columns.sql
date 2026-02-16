-- Migration: Add micronutrient columns to food_diary_entries and calorie_goals
-- These columns were referenced in the application code but missing from the DB schema
-- Date: 2026-02-16

-- ==========================================
-- Add micronutrient columns to food_diary_entries
-- ==========================================
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS potassium DECIMAL(7,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS calcium DECIMAL(7,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS iron DECIMAL(5,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS vitamin_c DECIMAL(6,1);
ALTER TABLE food_diary_entries ADD COLUMN IF NOT EXISTS cholesterol DECIMAL(6,1);

-- ==========================================
-- Add micronutrient goal columns to calorie_goals
-- ==========================================
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS potassium_goal DECIMAL(7,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS calcium_goal DECIMAL(7,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS iron_goal DECIMAL(5,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS vitamin_c_goal DECIMAL(6,1);
ALTER TABLE calorie_goals ADD COLUMN IF NOT EXISTS cholesterol_goal DECIMAL(6,1);

-- ==========================================
-- Update daily_diary_summary view to include micronutrients
-- ==========================================
CREATE OR REPLACE VIEW daily_diary_summary AS
SELECT
    client_id,
    entry_date,
    SUM(calories) as total_calories,
    SUM(protein) as total_protein,
    SUM(carbs) as total_carbs,
    SUM(fat) as total_fat,
    SUM(fiber) as total_fiber,
    SUM(sugar) as total_sugar,
    SUM(sodium) as total_sodium,
    SUM(potassium) as total_potassium,
    SUM(calcium) as total_calcium,
    SUM(iron) as total_iron,
    SUM(vitamin_c) as total_vitamin_c,
    SUM(cholesterol) as total_cholesterol,
    COUNT(*) as entry_count
FROM food_diary_entries
GROUP BY client_id, entry_date;
