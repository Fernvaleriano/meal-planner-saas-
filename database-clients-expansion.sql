-- Expand client profiles to include all meal planning data
-- This allows coaches to save complete client information and auto-populate the meal planner

-- Add physical/demographic data
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS weight DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS height_ft INTEGER,
  ADD COLUMN IF NOT EXISTS height_in INTEGER,
  ADD COLUMN IF NOT EXISTS unit_system VARCHAR(20) DEFAULT 'imperial';

-- Add activity and goals
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS activity_level DECIMAL(4,2);

-- Calorie adjustment is already part of default_goal, but let's add specific field
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS calorie_adjustment INTEGER DEFAULT 0;

-- Add dietary preferences (diet_type is omnivore/vegan/vegetarian/keto)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS diet_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS macro_preference VARCHAR(50) DEFAULT 'balanced';

-- Add food preferences and restrictions
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS disliked_foods TEXT,
  ADD COLUMN IF NOT EXISTS preferred_foods TEXT,
  ADD COLUMN IF NOT EXISTS budget VARCHAR(50);

-- Add meal planning preferences
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS meal_count VARCHAR(50) DEFAULT '3 meals',
  ADD COLUMN IF NOT EXISTS cooking_equipment JSONB DEFAULT '[]'::jsonb;

-- Add protein powder info
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS use_protein_powder BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS protein_powder_brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS protein_powder_calories INTEGER,
  ADD COLUMN IF NOT EXISTS protein_powder_protein INTEGER,
  ADD COLUMN IF NOT EXISTS protein_powder_carbs INTEGER,
  ADD COLUMN IF NOT EXISTS protein_powder_fat INTEGER;

-- Add comment explaining the schema expansion
COMMENT ON TABLE clients IS 'Stores complete client profiles including physical stats, dietary preferences, and meal planning settings for auto-population';
