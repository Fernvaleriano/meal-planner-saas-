-- Add branding fields to coaches table for white-label customization
-- Professional tier coaches can customize their branding

ALTER TABLE coaches
    -- Brand Identity
    ADD COLUMN IF NOT EXISTS brand_name TEXT,
    ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_favicon_url TEXT,

    -- Brand Colors (stored as hex values like #0d9488)
    ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_secondary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_accent_color VARCHAR(7),

    -- Email Branding
    ADD COLUMN IF NOT EXISTS brand_email_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_email_footer TEXT,

    -- Tracking
    ADD COLUMN IF NOT EXISTS branding_updated_at TIMESTAMP WITH TIME ZONE;

-- Add comment for reference
COMMENT ON COLUMN coaches.brand_name IS 'Custom brand name displayed instead of Zique Fitness';
COMMENT ON COLUMN coaches.brand_primary_color IS 'Primary brand color in hex format (e.g., #0d9488)';
COMMENT ON COLUMN coaches.brand_secondary_color IS 'Secondary brand color in hex format (e.g., #0284c7)';
COMMENT ON COLUMN coaches.brand_accent_color IS 'Accent color for highlights in hex format (e.g., #10b981)';
COMMENT ON COLUMN coaches.brand_logo_url IS 'URL to custom logo displayed in header';
COMMENT ON COLUMN coaches.brand_favicon_url IS 'URL to custom favicon';
COMMENT ON COLUMN coaches.brand_email_logo_url IS 'URL to logo displayed in email headers';
COMMENT ON COLUMN coaches.brand_email_footer IS 'Custom footer text for emails';
