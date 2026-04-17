-- Add serving size tracking to meal_favorites so per-100g scaling is accurate.
-- Before this, food-search.js assumed every favorite was 100g, which corrupted
-- macro totals for any favorite whose actual portion was larger or smaller.

ALTER TABLE meal_favorites
    ADD COLUMN IF NOT EXISTS serving_size DECIMAL(8,2),
    ADD COLUMN IF NOT EXISTS serving_unit VARCHAR(50),
    ADD COLUMN IF NOT EXISTS number_of_servings DECIMAL(8,2) DEFAULT 1;
