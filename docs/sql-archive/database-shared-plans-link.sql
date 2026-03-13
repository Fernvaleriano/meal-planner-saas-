-- Add coach_plan_id column to shared_meal_plans table to link shared plans with coach plans
-- This allows automatic deletion of shared links when coach deletes a plan

ALTER TABLE shared_meal_plans
  ADD COLUMN IF NOT EXISTS coach_plan_id INTEGER REFERENCES coach_meal_plans(id) ON DELETE CASCADE;

-- Create index for faster lookups when deleting coach plans
CREATE INDEX IF NOT EXISTS idx_shared_plans_coach_plan_id ON shared_meal_plans(coach_plan_id);

-- Note: Existing shared plans will have NULL coach_plan_id (which is fine)
-- New shared plans created after this migration will have the link
