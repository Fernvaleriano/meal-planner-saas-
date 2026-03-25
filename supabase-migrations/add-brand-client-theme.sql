-- ============================================================
-- Add brand_client_theme column to coaches table
-- Allows coaches to set the default theme (light/dark/system)
-- that their clients see when using the app.
-- ============================================================

-- Add the column with 'dark' as default (matches current behavior)
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS brand_client_theme VARCHAR(10) DEFAULT 'dark';

-- Add a check constraint to ensure valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coaches_brand_client_theme_check'
  ) THEN
    ALTER TABLE public.coaches
    ADD CONSTRAINT coaches_brand_client_theme_check
    CHECK (brand_client_theme IN ('light', 'dark', 'system'));
  END IF;
END $$;

-- Update the get_my_coach_branding RPC to include the new column
CREATE OR REPLACE FUNCTION public.get_my_coach_branding()
RETURNS TABLE (
  id uuid,
  name text,
  subscription_tier text,
  brand_name text,
  brand_logo_url text,
  brand_favicon_url text,
  brand_primary_color text,
  brand_secondary_color text,
  brand_accent_color text,
  brand_email_logo_url text,
  brand_email_footer text,
  branding_updated_at timestamptz,
  profile_photo_url text,
  brand_bg_color text,
  brand_bg_secondary_color text,
  brand_card_color text,
  brand_text_color text,
  brand_text_secondary_color text,
  brand_font text,
  brand_button_style text,
  brand_welcome_message text,
  brand_app_name text,
  brand_short_name text,
  client_modules jsonb,
  custom_terminology jsonb,
  brand_client_theme text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.subscription_tier,
    c.brand_name,
    c.brand_logo_url,
    c.brand_favicon_url,
    c.brand_primary_color,
    c.brand_secondary_color,
    c.brand_accent_color,
    c.brand_email_logo_url,
    c.brand_email_footer,
    c.branding_updated_at,
    c.profile_photo_url,
    c.brand_bg_color,
    c.brand_bg_secondary_color,
    c.brand_card_color,
    c.brand_text_color,
    c.brand_text_secondary_color,
    c.brand_font,
    c.brand_button_style,
    c.brand_welcome_message,
    c.brand_app_name,
    c.brand_short_name,
    c.client_modules,
    c.custom_terminology,
    c.brand_client_theme
  FROM public.clients cl
  JOIN public.coaches c ON c.id = cl.coach_id
  WHERE cl.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_coach_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_coach_branding() TO authenticated;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'coaches' AND column_name = 'brand_client_theme';
