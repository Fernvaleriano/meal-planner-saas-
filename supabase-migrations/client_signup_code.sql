-- Add signup code feature for client self-registration
-- Coaches can share their unique code with clients for self-signup

-- Add signup code column to coaches table
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS signup_code VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS signup_code_enabled BOOLEAN DEFAULT true;

-- Set your specific signup code
UPDATE coaches
SET signup_code = 'ZFFV'
WHERE signup_code IS NULL;

-- Create index for fast lookup by signup code
CREATE INDEX IF NOT EXISTS idx_coaches_signup_code ON coaches(signup_code) WHERE signup_code IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN coaches.signup_code IS 'Unique code clients can use to self-register with this coach';
COMMENT ON COLUMN coaches.signup_code_enabled IS 'Whether the signup code is currently active for new registrations';
