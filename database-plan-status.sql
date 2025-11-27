-- Migration: Add status column to coach_meal_plans for draft/publish workflow
-- Run this migration to enable the "Submit to Client" feature

-- Add status column with default 'draft'
ALTER TABLE coach_meal_plans
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' NOT NULL;

-- Add constraint to ensure only valid status values
ALTER TABLE coach_meal_plans
ADD CONSTRAINT check_plan_status
CHECK (status IN ('draft', 'published'));

-- Create index on status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_coach_meal_plans_status ON coach_meal_plans(status);

-- Update existing plans to 'published' (so current clients can still see their plans)
UPDATE coach_meal_plans SET status = 'published' WHERE status = 'draft';

-- Comment explaining the status values
COMMENT ON COLUMN coach_meal_plans.status IS 'Plan status: draft (coach reviewing, client cannot see) or published (visible to client)';
