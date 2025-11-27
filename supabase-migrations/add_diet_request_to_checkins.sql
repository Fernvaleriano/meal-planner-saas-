-- Migration: Add diet request fields to client_checkins table
-- This allows clients to request a new diet plan when submitting a check-in

-- Add diet request fields to client_checkins table
ALTER TABLE client_checkins
ADD COLUMN IF NOT EXISTS request_new_diet BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS diet_request_reason TEXT;

-- Add index for coaches to quickly find diet requests
CREATE INDEX IF NOT EXISTS idx_checkins_diet_request ON client_checkins(coach_id, request_new_diet)
WHERE request_new_diet = TRUE;

-- Comment on new columns
COMMENT ON COLUMN client_checkins.request_new_diet IS 'Whether the client is requesting a new meal plan';
COMMENT ON COLUMN client_checkins.diet_request_reason IS 'Reason for requesting a new diet (goals changed, not satisfied, etc.)';
