-- Migration: Add white-label email settings for coaches
-- This allows coaches to send emails from their own branded domain

-- Add email branding columns to coaches table
ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS email_from VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_from_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_domain_verified BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN coaches.email_from IS 'Custom from email address for white-label (e.g., noreply@coachbrand.com)';
COMMENT ON COLUMN coaches.email_from_name IS 'Custom from name for white-label (e.g., Coach Brand Nutrition)';
COMMENT ON COLUMN coaches.email_domain_verified IS 'Whether the coach domain has been verified in Resend';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_coaches_email_domain_verified ON coaches(email_domain_verified) WHERE email_domain_verified = TRUE;
