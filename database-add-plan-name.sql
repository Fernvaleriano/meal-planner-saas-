-- Migration: Add plan_name column to coach_meal_plans
-- This column allows coaches to give custom names to their meal plans

-- Add plan_name column
ALTER TABLE coach_meal_plans
ADD COLUMN IF NOT EXISTS plan_name VARCHAR(255);

-- Create index for searching by plan name
CREATE INDEX IF NOT EXISTS idx_coach_meal_plans_plan_name ON coach_meal_plans(coach_id, plan_name);

-- Comment explaining the column
COMMENT ON COLUMN coach_meal_plans.plan_name IS 'Optional custom name for the meal plan given by the coach';
