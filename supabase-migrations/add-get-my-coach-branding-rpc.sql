-- SECURITY DEFINER RPC: returns the current authenticated client's coach branding.
-- This is resilient even when direct SELECT policies on coaches are missing/incomplete.

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
  custom_terminology jsonb
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
    c.custom_terminology
  FROM public.clients cl
  JOIN public.coaches c ON c.id = cl.coach_id
  WHERE cl.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_coach_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_coach_branding() TO authenticated;
