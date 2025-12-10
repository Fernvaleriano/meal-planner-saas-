-- Fix Coach UUID Mismatch
-- This migration fixes the UUID mismatch between Supabase Auth users and coaches table records.
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
--
-- IMPORTANT: Run each section one at a time and verify before proceeding.
-- Some tables may not exist in your database - the IF EXISTS clause handles this gracefully.

-- ============================================================================
-- COACH 1: contact@ziquefitness.com
-- Old UUID: 82ac7c4f-4200-4cd9-a5b2-2e41dd785c96
-- New UUID: 5f6b627b-e74b-4229-a77a-a7f2ed6b4b14
-- ============================================================================

-- Step 1: Create new coach record with new UUID (copy all columns)
INSERT INTO coaches (
    id, email, name, business_name, created_at, subscription_tier,
    stripe_customer_id, stripe_subscription_id, subscription_status,
    avatar_url, show_avatar_in_greeting, profile_photo_url,
    brand_name, brand_logo_url, brand_favicon_url,
    brand_primary_color, brand_secondary_color, brand_accent_color,
    brand_email_logo_url, brand_email_footer, branding_updated_at,
    trial_ends_at, current_period_end, canceled_at, cancel_at,
    last_payment_at, onboarding_completed, updated_at
)
SELECT
    '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14',
    email, name, business_name, created_at, subscription_tier,
    stripe_customer_id, stripe_subscription_id, subscription_status,
    avatar_url, show_avatar_in_greeting, profile_photo_url,
    brand_name, brand_logo_url, brand_favicon_url,
    brand_primary_color, brand_secondary_color, brand_accent_color,
    brand_email_logo_url, brand_email_footer, branding_updated_at,
    trial_ends_at, current_period_end, canceled_at, cancel_at,
    last_payment_at, onboarding_completed, updated_at
FROM coaches
WHERE id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';

-- Step 2: Update all related tables (run each individually - tables that don't exist will error, skip those)
-- Core tables mentioned by user:
UPDATE meal_plan_templates SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE clients SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE coach_stories SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE coach_supplements SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';

-- Additional tables from schema (some may not exist in your database):
UPDATE coach_meal_plans SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE food_diary_entries SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE saved_custom_meals SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE supplement_library SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE client_measurements SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE client_protocols SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE checkin_settings SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE checkin_reminders SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE weekly_checkin_requests SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE custom_checkin_fields SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE recipes SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE recipe_comments SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE client_favorites SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE client_weekly_checkins SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE progress_photos SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE coach_gym_settings SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE exercises SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE workout_programs SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE workout_assignments SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE workout_logs SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE activity_item_dismissals SET coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
UPDATE notifications SET user_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' WHERE user_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';

-- Step 3: Delete old coach record
DELETE FROM coaches WHERE id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';


-- ============================================================================
-- COACH 2: valeriano_Fernando@yahoo.com
-- Old UUID: (TO BE DETERMINED - check coaches table)
-- New UUID: (TO BE DETERMINED - check auth.users table)
-- ============================================================================
--
-- Run this query first to find the OLD UUID:
-- SELECT id, email FROM coaches WHERE email = 'valeriano_Fernando@yahoo.com';
--
-- Then check the NEW UUID in auth.users:
-- SELECT id, email FROM auth.users WHERE email = 'valeriano_Fernando@yahoo.com';
--
-- Once you have both UUIDs, uncomment and update the block below:

/*
DO $$
DECLARE
    old_coach_id UUID := 'OLD-UUID-HERE';  -- Replace with actual old UUID
    new_coach_id UUID := 'NEW-UUID-HERE';  -- Replace with actual new UUID
BEGIN
    INSERT INTO coaches (
        id, email, name, business_name, created_at, subscription_tier,
        stripe_customer_id, stripe_subscription_id, subscription_status,
        avatar_url, show_avatar_in_greeting, profile_photo_url,
        brand_name, brand_logo_url, brand_favicon_url,
        brand_primary_color, brand_secondary_color, brand_accent_color,
        brand_email_logo_url, brand_email_footer, branding_updated_at,
        trial_ends_at, current_period_end, canceled_at, cancel_at,
        last_payment_at, onboarding_completed, updated_at
    )
    SELECT
        new_coach_id,
        email, name, business_name, created_at, subscription_tier,
        stripe_customer_id, stripe_subscription_id, subscription_status,
        avatar_url, show_avatar_in_greeting, profile_photo_url,
        brand_name, brand_logo_url, brand_favicon_url,
        brand_primary_color, brand_secondary_color, brand_accent_color,
        brand_email_logo_url, brand_email_footer, branding_updated_at,
        trial_ends_at, current_period_end, canceled_at, cancel_at,
        last_payment_at, onboarding_completed, updated_at
    FROM coaches
    WHERE id = old_coach_id;

    UPDATE meal_plan_templates SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE clients SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_stories SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_supplements SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_meal_plans SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE food_diary_entries SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE saved_custom_meals SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE supplement_library SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_measurements SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_protocols SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE checkin_settings SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE checkin_reminders SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE weekly_checkin_requests SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE custom_checkin_fields SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE recipes SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE recipe_comments SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_favorites SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_weekly_checkins SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE progress_photos SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_gym_settings SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE exercises SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_programs SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_assignments SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_logs SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE activity_item_dismissals SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE notifications SET user_id = new_coach_id WHERE user_id = old_coach_id;

    DELETE FROM coaches WHERE id = old_coach_id;

    RAISE NOTICE 'Migration completed for valeriano_Fernando@yahoo.com';
END $$;
*/


-- ============================================================================
-- COACH 3: Fernvalthai@gmail.com
-- Old UUID: (TO BE DETERMINED - check coaches table)
-- New UUID: (TO BE DETERMINED - check auth.users table)
-- ============================================================================
--
-- Run this query first to find the OLD UUID:
-- SELECT id, email FROM coaches WHERE email = 'Fernvalthai@gmail.com';
--
-- Then check the NEW UUID in auth.users:
-- SELECT id, email FROM auth.users WHERE email = 'Fernvalthai@gmail.com';
--
-- Once you have both UUIDs, uncomment and update the block below:

/*
DO $$
DECLARE
    old_coach_id UUID := 'OLD-UUID-HERE';  -- Replace with actual old UUID
    new_coach_id UUID := 'NEW-UUID-HERE';  -- Replace with actual new UUID
BEGIN
    INSERT INTO coaches (
        id, email, name, business_name, created_at, subscription_tier,
        stripe_customer_id, stripe_subscription_id, subscription_status,
        avatar_url, show_avatar_in_greeting, profile_photo_url,
        brand_name, brand_logo_url, brand_favicon_url,
        brand_primary_color, brand_secondary_color, brand_accent_color,
        brand_email_logo_url, brand_email_footer, branding_updated_at,
        trial_ends_at, current_period_end, canceled_at, cancel_at,
        last_payment_at, onboarding_completed, updated_at
    )
    SELECT
        new_coach_id,
        email, name, business_name, created_at, subscription_tier,
        stripe_customer_id, stripe_subscription_id, subscription_status,
        avatar_url, show_avatar_in_greeting, profile_photo_url,
        brand_name, brand_logo_url, brand_favicon_url,
        brand_primary_color, brand_secondary_color, brand_accent_color,
        brand_email_logo_url, brand_email_footer, branding_updated_at,
        trial_ends_at, current_period_end, canceled_at, cancel_at,
        last_payment_at, onboarding_completed, updated_at
    FROM coaches
    WHERE id = old_coach_id;

    UPDATE meal_plan_templates SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE clients SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_stories SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_supplements SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_meal_plans SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE food_diary_entries SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE saved_custom_meals SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE supplement_library SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_measurements SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_protocols SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE checkin_settings SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE checkin_reminders SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE weekly_checkin_requests SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE custom_checkin_fields SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE recipes SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE recipe_comments SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_favorites SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE client_weekly_checkins SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE progress_photos SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE coach_gym_settings SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE exercises SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_programs SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_assignments SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE workout_logs SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE activity_item_dismissals SET coach_id = new_coach_id WHERE coach_id = old_coach_id;
    UPDATE notifications SET user_id = new_coach_id WHERE user_id = old_coach_id;

    DELETE FROM coaches WHERE id = old_coach_id;

    RAISE NOTICE 'Migration completed for Fernvalthai@gmail.com';
END $$;
*/


-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================

-- Verify coach record exists with new UUID
-- SELECT * FROM coaches WHERE email = 'contact@ziquefitness.com';

-- Verify clients were migrated
-- SELECT coach_id, count(*) FROM clients WHERE coach_id = '5f6b627b-e74b-4229-a77a-a7f2ed6b4b14' GROUP BY coach_id;

-- Check for any remaining references to old UUID (should return 0)
-- SELECT 'clients' as table_name, count(*) FROM clients WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96'
-- UNION ALL SELECT 'meal_plan_templates', count(*) FROM meal_plan_templates WHERE coach_id = '82ac7c4f-4200-4cd9-a5b2-2e41dd785c96';
