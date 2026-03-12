-- Coach Branding V2: Extended branding, module visibility, custom terminology
-- Adds support for:
--   1. Extended color palette (background, text, card colors) + font + button style
--   2. Module visibility toggles (coaches hide/show tabs for clients)
--   3. Custom welcome message for client login
--   4. Dynamic PWA manifest fields (app name, short name)
--   5. Custom terminology (rename UI labels)

-- ============================================================
-- 1. EXTENDED BRANDING (Layer 1 - Visual Identity)
-- ============================================================

-- Additional color controls beyond the existing 3 brand colors
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS brand_bg_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_bg_secondary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_card_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_text_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS brand_text_secondary_color VARCHAR(7);

-- Font and button style
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS brand_font TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS brand_button_style VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN coaches.brand_bg_color IS 'Custom background color (overrides --bg-primary)';
COMMENT ON COLUMN coaches.brand_bg_secondary_color IS 'Custom secondary background (overrides --bg-secondary)';
COMMENT ON COLUMN coaches.brand_card_color IS 'Custom card/surface color';
COMMENT ON COLUMN coaches.brand_text_color IS 'Custom primary text color';
COMMENT ON COLUMN coaches.brand_text_secondary_color IS 'Custom secondary/muted text color';
COMMENT ON COLUMN coaches.brand_font IS 'Google Font name (e.g., Inter, Poppins, Montserrat)';
COMMENT ON COLUMN coaches.brand_button_style IS 'Button border-radius style: rounded, sharp, pill';

-- ============================================================
-- 2. MODULE VISIBILITY TOGGLES (Layer 4 - Feature Controls)
-- ============================================================

-- JSONB for flexibility — coach toggles which tabs/features clients see
-- Default: all modules visible
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS client_modules JSONB DEFAULT '{"diary": true, "plans": true, "workouts": true, "messages": true, "recipes": true, "check_in": true, "progress": true}'::jsonb;

COMMENT ON COLUMN coaches.client_modules IS 'Which modules/tabs are visible to this coach''s clients. Keys: diary, plans, workouts, messages, recipes, check_in, progress';

-- ============================================================
-- 3. BRANDED CLIENT WELCOME (Layer 2 - Client Experience)
-- ============================================================

ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS brand_welcome_message TEXT;

COMMENT ON COLUMN coaches.brand_welcome_message IS 'Custom welcome message shown on client login page (max 200 chars)';

-- ============================================================
-- 4. DYNAMIC PWA MANIFEST FIELDS
-- ============================================================

-- These feed the dynamic manifest endpoint so homescreen saves show coach branding
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS brand_app_name TEXT,
    ADD COLUMN IF NOT EXISTS brand_short_name VARCHAR(12);

COMMENT ON COLUMN coaches.brand_app_name IS 'Custom app name for PWA manifest (e.g., "FitCoach Nutrition")';
COMMENT ON COLUMN coaches.brand_short_name IS 'Short name for PWA manifest, max 12 chars (e.g., "FitCoach")';

-- ============================================================
-- 5. CUSTOM TERMINOLOGY (Layer 3 - Content Branding)
-- ============================================================

-- JSONB mapping of standard terms to custom labels
-- e.g., {"diary": "Food Log", "plans": "Nutrition Protocol", "workouts": "Training", "check_in": "Weekly Update", "meals": "Nutrition"}
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS custom_terminology JSONB DEFAULT NULL;

COMMENT ON COLUMN coaches.custom_terminology IS 'Custom UI label overrides. Keys: home, diary, plans, workouts, messages, meals, check_in, progress, recipes. Values: custom display text';
