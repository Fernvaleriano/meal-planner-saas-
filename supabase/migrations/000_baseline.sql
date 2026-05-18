-- ZIQUECOACH PRODUCTION SCHEMA BASELINE (generated from prod 2026-05-18)
-- 000_baseline.sql — see DB-RECOVERY-RUNBOOK.md
SET check_function_bodies = false;

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.activity_reactions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ai_message_drafts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ai_plateau_acknowledgements_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.calorie_goals_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.challenge_participants_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.challenge_progress_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.chat_messages_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.checkin_reminder_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.checkin_reminder_settings_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_checkins_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_exercise_personal_notes_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_measurements_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_protocols_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_reminder_preferences_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.client_workout_assignments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.clients_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.club_workouts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_challenges_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_command_center_pins_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_daily_briefings_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_exercise_references_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_meal_plans_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_settings_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_stories_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coach_story_highlights_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.diary_entry_comments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.diary_entry_reactions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.dismissed_activity_items_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exercise_logs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exercises_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.food_diary_entries_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.form_responses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.form_templates_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.gym_proofs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.master_account_audit_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.meal_favorites_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.meal_images_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.meal_plan_templates_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.notification_delivery_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.notifications_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.pep_talks_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.personal_records_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.progress_photos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.recipe_requests_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.recipes_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.saved_custom_meals_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shared_meal_plans_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shared_workout_programs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.story_reactions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.story_replies_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.story_views_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.supplement_intake_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.supplement_library_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.water_intake_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.weight_proofs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.workout_logs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.workout_programs_id_seq;

-- TABLES
CREATE TABLE public.activity_reactions (
  id integer DEFAULT nextval('activity_reactions_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  client_id integer,
  item_type character varying(30) NOT NULL,
  item_id character varying(50) NOT NULL,
  reaction character varying(10) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ai_message_drafts (
  id bigint DEFAULT nextval('ai_message_drafts_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_id bigint NOT NULL,
  kind text NOT NULL,
  subject text,
  body text NOT NULL,
  why text,
  sent_at timestamp with time zone,
  edited_body text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_plateau_acknowledgements (
  id bigint DEFAULT nextval('ai_plateau_acknowledgements_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_id bigint NOT NULL,
  plateau_type text NOT NULL,
  metric text NOT NULL,
  status text NOT NULL,
  snooze_until date,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  actor_id uuid NOT NULL,
  tenant_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bkp_20260516_client_workout_assignments (
  id integer,
  client_id integer,
  coach_id uuid,
  program_id integer,
  name character varying(255),
  start_date date,
  end_date date,
  workout_data jsonb,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE public.bkp_20260516_exercise_logs (
  id integer,
  workout_log_id integer,
  exercise_id integer,
  exercise_name character varying(255),
  exercise_order integer,
  sets_data jsonb,
  total_sets integer,
  total_reps integer,
  total_volume numeric(10,2),
  max_weight numeric(8,2),
  notes text,
  is_pr boolean,
  created_at timestamp with time zone,
  client_notes text,
  client_voice_note_path text
);

CREATE TABLE public.bkp_20260516_workout_logs (
  id integer,
  client_id integer,
  coach_id uuid,
  assignment_id integer,
  workout_date date,
  workout_name character varying(255),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_minutes integer,
  total_volume numeric(10,2),
  total_sets integer,
  total_reps integer,
  estimated_calories integer,
  notes text,
  energy_level integer,
  workout_rating integer,
  status character varying(20),
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE public.bkp_20260516_workout_programs (
  id integer,
  coach_id uuid,
  name character varying(255),
  description text,
  program_type character varying(50),
  difficulty character varying(20),
  duration_weeks integer,
  days_per_week integer,
  program_data jsonb,
  is_template boolean,
  is_published boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_club_workout boolean
);

CREATE TABLE public.calorie_goals (
  id integer DEFAULT nextval('calorie_goals_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  calorie_goal integer DEFAULT 2000,
  protein_goal numeric(5,1) DEFAULT 150,
  carbs_goal numeric(5,1) DEFAULT 200,
  fat_goal numeric(5,1) DEFAULT 65,
  fiber_goal numeric(5,1),
  sugar_goal numeric(5,1),
  sodium_goal numeric(6,1),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  potassium_goal numeric(7,1),
  calcium_goal numeric(7,1),
  iron_goal numeric(5,1),
  vitamin_c_goal numeric(6,1),
  cholesterol_goal numeric(6,1)
);

CREATE TABLE public.challenge_participants (
  id integer DEFAULT nextval('challenge_participants_id_seq'::regclass) NOT NULL,
  challenge_id integer NOT NULL,
  client_id integer NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  status character varying(20) DEFAULT 'active'::character varying
);

CREATE TABLE public.challenge_progress (
  id integer DEFAULT nextval('challenge_progress_id_seq'::regclass) NOT NULL,
  challenge_id integer NOT NULL,
  client_id integer NOT NULL,
  log_date date DEFAULT CURRENT_DATE NOT NULL,
  value numeric,
  completed boolean DEFAULT false,
  photo_url text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id integer DEFAULT nextval('chat_messages_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_id integer NOT NULL,
  sender_type character varying(10) NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  media_url text,
  media_type character varying(10),
  deleted_at timestamp with time zone
);

CREATE TABLE public.checkin_reminder_log (
  id integer DEFAULT nextval('checkin_reminder_log_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  reminder_type character varying(20) DEFAULT 'initial'::character varying NOT NULL,
  delivery_method character varying(20) DEFAULT 'email'::character varying NOT NULL,
  status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
  error_message text,
  email_sent_to character varying(255),
  checkin_week_start date,
  resulted_in_checkin boolean DEFAULT false,
  checkin_completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.checkin_reminder_settings (
  id integer DEFAULT nextval('checkin_reminder_settings_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  reminders_enabled boolean DEFAULT true,
  reminder_day integer DEFAULT 0,
  reminder_hour integer DEFAULT 9,
  days_before_deadline integer DEFAULT 1,
  email_subject character varying(255) DEFAULT 'Time for your weekly check-in!'::character varying,
  email_message text DEFAULT 'Hi {client_name},

This is a friendly reminder to complete your weekly check-in. Your coach is looking forward to hearing about your progress!

Click the link below to submit your check-in:
{checkin_link}

Best,
{coach_name}'::text,
  send_followup boolean DEFAULT true,
  followup_hours integer DEFAULT 24,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_adhoc_workouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id bigint NOT NULL,
  workout_date date NOT NULL,
  name text DEFAULT 'Custom Workout'::text,
  workout_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_checkins (
  id integer DEFAULT nextval('client_checkins_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  checkin_date date DEFAULT CURRENT_DATE NOT NULL,
  weight numeric(5,1),
  weight_unit character varying(10) DEFAULT 'lbs'::character varying,
  energy_level integer,
  sleep_quality integer,
  hunger_level integer,
  stress_level integer,
  meal_plan_adherence integer,
  workouts_completed integer DEFAULT 0,
  workouts_planned integer DEFAULT 0,
  water_intake character varying(50),
  wins text,
  challenges text,
  questions text,
  notes text,
  coach_feedback text,
  coach_responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  request_new_diet boolean DEFAULT false,
  diet_request_reason text
);

CREATE TABLE public.client_exercise_personal_notes (
  id bigint DEFAULT nextval('client_exercise_personal_notes_id_seq'::regclass) NOT NULL,
  client_id integer NOT NULL,
  exercise_name character varying(255) NOT NULL,
  note_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_measurements (
  id integer DEFAULT nextval('client_measurements_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  measured_date date DEFAULT CURRENT_DATE NOT NULL,
  weight numeric(5,1),
  weight_unit character varying(10) DEFAULT 'lbs'::character varying,
  body_fat_percentage numeric(4,1),
  chest numeric(5,1),
  waist numeric(5,1),
  hips numeric(5,1),
  left_arm numeric(5,1),
  right_arm numeric(5,1),
  left_thigh numeric(5,1),
  right_thigh numeric(5,1),
  measurement_unit character varying(10) DEFAULT 'in'::character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id bigint NOT NULL,
  coach_id uuid NOT NULL,
  plan_id uuid,
  subscription_id uuid,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_charge_id text,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'usd'::text,
  status text DEFAULT 'succeeded'::text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_protocols (
  id integer DEFAULT nextval('client_protocols_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_id integer NOT NULL,
  name text NOT NULL,
  timing text DEFAULT 'morning'::text,
  timing_custom text,
  dose text,
  has_schedule boolean DEFAULT false,
  schedule jsonb,
  start_date date,
  notes text,
  private_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  frequency_type character varying(50) DEFAULT 'daily'::character varying,
  frequency_interval integer DEFAULT 1,
  frequency_days integer[],
  client_start_date date,
  last_taken_date date,
  image_url text
);

CREATE TABLE public.client_reminder_preferences (
  id integer DEFAULT nextval('client_reminder_preferences_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  reminders_enabled boolean DEFAULT true,
  custom_reminder_day integer,
  preferred_hour integer,
  timezone character varying(50) DEFAULT 'America/New_York'::character varying,
  email_reminders boolean DEFAULT true,
  inapp_reminders boolean DEFAULT true,
  last_reminder_sent_at timestamp with time zone,
  last_followup_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id bigint NOT NULL,
  coach_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text DEFAULT 'active'::text NOT NULL,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_ends_at timestamp with time zone,
  canceled_at timestamp with time zone,
  cancel_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pending_plan_id uuid,
  pending_change_effective_at timestamp with time zone,
  stripe_schedule_id text
);

CREATE TABLE public.client_workout_assignments (
  id integer DEFAULT nextval('client_workout_assignments_id_seq'::regclass) NOT NULL,
  client_id integer NOT NULL,
  coach_id uuid NOT NULL,
  program_id integer,
  name character varying(255) NOT NULL,
  start_date date,
  end_date date,
  workout_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.clients (
  id bigint DEFAULT nextval('clients_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_name character varying(255) NOT NULL,
  email character varying(255),
  phone character varying(50),
  notes text,
  default_dietary_restrictions jsonb DEFAULT '[]'::jsonb,
  default_goal character varying(50),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  age integer,
  gender character varying(20),
  weight numeric(6,2),
  height_ft integer,
  height_in integer,
  unit_system character varying(20) DEFAULT 'imperial'::character varying,
  activity_level numeric(4,2),
  calorie_adjustment integer DEFAULT 0,
  diet_type character varying(50),
  macro_preference character varying(50) DEFAULT 'balanced'::character varying,
  allergies text,
  disliked_foods text,
  preferred_foods text,
  budget character varying(50),
  meal_count character varying(50) DEFAULT '3 meals'::character varying,
  cooking_equipment jsonb DEFAULT '[]'::jsonb,
  use_protein_powder boolean DEFAULT false,
  protein_powder_brand character varying(100),
  protein_powder_calories integer,
  protein_powder_protein integer,
  protein_powder_carbs integer,
  protein_powder_fat integer,
  user_id uuid,
  invited_at timestamp with time zone,
  registered_at timestamp with time zone,
  use_branded_foods boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  archived_at timestamp with time zone,
  last_activity_at timestamp with time zone,
  can_edit_goals boolean DEFAULT false,
  profile_photo_url text,
  intake_token character varying(64),
  intake_token_expires_at timestamp with time zone,
  unit_preference character varying(10) DEFAULT 'imperial'::character varying,
  avatar_url text,
  calorie_goal numeric,
  protein_goal numeric,
  carbs_goal numeric,
  fat_goal numeric,
  preferred_exercise_gender character varying(20) DEFAULT 'all'::character varying,
  fitness_level character varying(50),
  exercise_frequency character varying(50),
  workout_duration character varying(50),
  equipment_access character varying(50),
  exercise_types jsonb DEFAULT '[]'::jsonb,
  health_concerns text,
  fitness_goal_details text,
  unavailable_equipment jsonb DEFAULT '[]'::jsonb,
  can_edit_micronutrient_goals boolean DEFAULT false,
  water_goal integer DEFAULT 8,
  water_unit text DEFAULT 'glasses'::text,
  is_sample boolean DEFAULT false,
  intake_form_config jsonb,
  custom_intake_answers text,
  is_demo boolean DEFAULT false,
  health_flags jsonb DEFAULT '{}'::jsonb,
  access_status text DEFAULT 'active'::text NOT NULL,
  access_paused_at timestamp with time zone,
  deletion_requested_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE public.club_workouts (
  id integer DEFAULT nextval('club_workouts_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  category character varying(100),
  difficulty character varying(20),
  workout_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_challenges (
  id integer DEFAULT nextval('coach_challenges_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  title character varying(255) NOT NULL,
  description text,
  challenge_type character varying(50) DEFAULT 'custom'::character varying NOT NULL,
  target_value numeric,
  target_unit character varying(50),
  frequency character varying(20) DEFAULT 'daily'::character varying,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status character varying(20) DEFAULT 'active'::character varying,
  assign_to character varying(20) DEFAULT 'all'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_command_center_pins (
  id bigint DEFAULT nextval('coach_command_center_pins_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  item_type text NOT NULL,
  item_ref text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.coach_daily_briefings (
  id bigint DEFAULT nextval('coach_daily_briefings_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  briefing_date date NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.coach_exercise_references (
  id integer DEFAULT nextval('coach_exercise_references_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  exercise_name character varying(255) NOT NULL,
  reference_links jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_meal_plans (
  id bigint DEFAULT nextval('coach_meal_plans_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_name character varying(255),
  plan_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  client_id bigint,
  coach_notes text,
  status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
  client_modified_data jsonb,
  client_modified_at timestamp with time zone,
  plan_name character varying(255)
);

CREATE TABLE public.coach_payment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  coach_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL,
  price_cents integer NOT NULL,
  currency text DEFAULT 'usd'::text,
  billing_interval text,
  trial_days integer DEFAULT 0,
  setup_fee_cents integer DEFAULT 0,
  tier_level integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  stripe_price_id text,
  stripe_product_id text,
  stripe_setup_price_id text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_promo_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  coach_id uuid NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  plan_ids uuid[] DEFAULT '{}'::uuid[],
  max_uses integer,
  times_used integer DEFAULT 0,
  expires_at timestamp with time zone,
  stripe_coupon_id text,
  stripe_promo_code_id text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_settings (
  id integer DEFAULT nextval('coach_settings_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  gym_features_enabled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_stories (
  id bigint DEFAULT nextval('coach_stories_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  content_type text NOT NULL,
  image_url text,
  caption text,
  quote_text text,
  quote_author text,
  link_url text,
  link_title text,
  link_preview_image text,
  is_highlight boolean DEFAULT false,
  highlight_id bigint,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_story_highlights (
  id bigint DEFAULT nextval('coach_story_highlights_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '📌'::text,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coaches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  subscription_tier text DEFAULT 'basic'::text,
  logo_url text,
  brand_colors text,
  moonclerk_customer_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'none'::text,
  trial_ends_at timestamp with time zone,
  current_period_end timestamp with time zone,
  canceled_at timestamp with time zone,
  last_payment_at timestamp with time zone,
  onboarding_completed boolean DEFAULT false,
  profile_photo_url text,
  email_from character varying(255),
  email_from_name character varying(255),
  email_domain_verified boolean DEFAULT false,
  brand_name text,
  brand_logo_url text,
  brand_favicon_url text,
  brand_primary_color character varying(7),
  brand_secondary_color character varying(7),
  brand_accent_color character varying(7),
  brand_email_logo_url text,
  brand_email_footer text,
  branding_updated_at timestamp with time zone,
  show_avatar_in_greeting boolean DEFAULT true,
  signup_code character varying(20),
  signup_code_enabled boolean DEFAULT true,
  stripe_connect_account_id text,
  stripe_connect_onboarding_complete boolean DEFAULT false,
  stripe_connect_charges_enabled boolean DEFAULT false,
  stripe_connect_payouts_enabled boolean DEFAULT false,
  brand_bg_color text,
  brand_bg_secondary_color text,
  brand_card_color text,
  brand_text_color text,
  brand_text_secondary_color text,
  brand_font text,
  brand_button_style text,
  brand_welcome_message text,
  brand_app_name text,
  brand_short_name character varying(12),
  client_modules jsonb,
  custom_terminology jsonb,
  brand_client_theme character varying(10) DEFAULT 'dark'::character varying,
  unit_preference text DEFAULT 'imperial'::text NOT NULL,
  dispute_disclosure_acknowledged_at timestamp with time zone,
  use_default_tutorial_video boolean DEFAULT false NOT NULL,
  custom_tutorial_video_url text,
  deletion_requested_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE public.contact_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.diary_entry_comments (
  id integer DEFAULT nextval('diary_entry_comments_id_seq'::regclass) NOT NULL,
  entry_id integer,
  coach_id uuid,
  client_id integer,
  comment text NOT NULL,
  parent_comment_id integer,
  author_type character varying(10) DEFAULT 'coach'::character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.diary_entry_reactions (
  id integer DEFAULT nextval('diary_entry_reactions_id_seq'::regclass) NOT NULL,
  entry_id integer,
  coach_id uuid,
  client_id integer,
  reaction character varying(10) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.dismissed_activity_items (
  id bigint DEFAULT nextval('dismissed_activity_items_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  client_id bigint,
  reason character varying(50) NOT NULL,
  dismissed_at timestamp with time zone DEFAULT now(),
  related_checkin_id text,
  notes text
);

CREATE TABLE public.exercise_logs (
  id integer DEFAULT nextval('exercise_logs_id_seq'::regclass) NOT NULL,
  workout_log_id integer NOT NULL,
  exercise_id integer,
  exercise_name character varying(255) NOT NULL,
  exercise_order integer,
  sets_data jsonb DEFAULT '[]'::jsonb NOT NULL,
  total_sets integer,
  total_reps integer,
  total_volume numeric(10,2),
  max_weight numeric(8,2),
  notes text,
  is_pr boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  client_notes text,
  client_voice_note_path text
);

CREATE TABLE public.exercises (
  id integer DEFAULT nextval('exercises_id_seq'::regclass) NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  instructions text,
  muscle_group character varying(100),
  secondary_muscles jsonb DEFAULT '[]'::jsonb,
  equipment character varying(100),
  exercise_type character varying(50),
  difficulty character varying(20),
  animation_url text,
  thumbnail_url text,
  calories_per_minute numeric(5,2),
  is_compound boolean DEFAULT false,
  is_unilateral boolean DEFAULT false,
  coach_id uuid,
  is_custom boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  category character varying(50),
  tips text,
  primary_muscles text,
  video_url text,
  gender_variant character varying(10),
  source character varying(50) DEFAULT 'exerciseanimatic'::character varying,
  form_tips jsonb DEFAULT '[]'::jsonb,
  common_mistakes jsonb DEFAULT '[]'::jsonb,
  coaching_cues jsonb DEFAULT '[]'::jsonb,
  reference_links jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE public.food_diary_entries (
  id integer DEFAULT nextval('food_diary_entries_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  entry_date date DEFAULT CURRENT_DATE NOT NULL,
  meal_type character varying(50) NOT NULL,
  food_name character varying(500) NOT NULL,
  brand character varying(200),
  serving_size numeric(8,2) DEFAULT 1,
  serving_unit character varying(50) DEFAULT 'serving'::character varying,
  number_of_servings numeric(5,2) DEFAULT 1,
  calories integer DEFAULT 0 NOT NULL,
  protein numeric(6,1) DEFAULT 0,
  carbs numeric(6,1) DEFAULT 0,
  fat numeric(6,1) DEFAULT 0,
  fiber numeric(5,1),
  sugar numeric(5,1),
  sodium numeric(6,1),
  external_id character varying(100),
  food_source character varying(50),
  is_quick_add boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  potassium numeric,
  calcium numeric,
  iron numeric,
  vitamin_c numeric,
  cholesterol numeric
);

CREATE TABLE public.form_responses (
  id bigint DEFAULT nextval('form_responses_id_seq'::regclass) NOT NULL,
  form_template_id bigint,
  response_data jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  submitted_at timestamp with time zone DEFAULT now(),
  is_read boolean DEFAULT false,
  notes text
);

CREATE TABLE public.form_templates (
  id bigint DEFAULT nextval('form_templates_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  name character varying(255) NOT NULL,
  slug character varying(100) NOT NULL,
  description text,
  form_config jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_active boolean DEFAULT true,
  is_owner_form boolean DEFAULT false,
  branding jsonb DEFAULT '{}'::jsonb,
  thank_you_message text DEFAULT 'Thanks for filling out this form!'::text,
  notification_email character varying(255),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gym_proofs (
  id integer DEFAULT nextval('gym_proofs_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  photo_url text NOT NULL,
  storage_path text NOT NULL,
  client_name character varying(255),
  proof_date date DEFAULT CURRENT_DATE NOT NULL,
  proof_time timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.master_account_audit (
  id bigint DEFAULT nextval('master_account_audit_id_seq'::regclass) NOT NULL,
  actor_user_id uuid,
  actor_email text,
  target_table text,
  target_row_id text,
  action text NOT NULL,
  blocked boolean DEFAULT false NOT NULL,
  reason text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.meal_favorites (
  id integer DEFAULT nextval('meal_favorites_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  meal_name character varying(500) NOT NULL,
  meal_type character varying(50),
  calories integer,
  protein numeric(5,1),
  carbs numeric(5,1),
  fat numeric(5,1),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  serving_size numeric(8,2),
  serving_unit character varying(50),
  number_of_servings numeric(8,2) DEFAULT 1,
  last_used_at timestamp with time zone
);

CREATE TABLE public.meal_images (
  id integer DEFAULT nextval('meal_images_id_seq'::regclass) NOT NULL,
  meal_name text NOT NULL,
  normalized_name text NOT NULL,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.meal_plan_templates (
  id integer DEFAULT nextval('meal_plan_templates_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  name character varying(255) NOT NULL,
  description text,
  meals_structure character varying(50),
  macro_preference character varying(50),
  preference character varying(50),
  plan_data jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.meal_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  coach_id uuid,
  client_name text NOT NULL,
  meal_plan_data jsonb NOT NULL,
  shareable_token text DEFAULT SUBSTRING(md5((random())::text) FROM 1 FOR 16) NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notification_delivery_log (
  id bigint DEFAULT nextval('notification_delivery_log_id_seq'::regclass) NOT NULL,
  notification_id bigint NOT NULL,
  delivered_at timestamp with time zone DEFAULT now() NOT NULL,
  channel text DEFAULT 'pwa'::text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
  id integer DEFAULT nextval('notifications_id_seq'::regclass) NOT NULL,
  user_id uuid,
  client_id integer,
  type character varying(50) NOT NULL,
  title character varying(255) NOT NULL,
  message text,
  related_checkin_id integer,
  related_client_id integer,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  related_entry_id integer,
  metadata jsonb
);

CREATE TABLE public.pep_talk_recipients (
  pep_talk_id integer NOT NULL,
  client_id integer NOT NULL
);

CREATE TABLE public.pep_talk_views (
  pep_talk_id integer NOT NULL,
  client_id integer NOT NULL,
  first_opened_at timestamp with time zone DEFAULT now() NOT NULL,
  viewed_at timestamp with time zone,
  dismiss_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.pep_talks (
  id integer DEFAULT nextval('pep_talks_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  title character varying(255) NOT NULL,
  body text,
  video_url text,
  video_duration_seconds integer,
  recipient_type character varying(10) DEFAULT 'all'::character varying NOT NULL,
  archived boolean DEFAULT false NOT NULL,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.personal_records (
  id integer DEFAULT nextval('personal_records_id_seq'::regclass) NOT NULL,
  client_id integer NOT NULL,
  exercise_id integer,
  exercise_name character varying(255) NOT NULL,
  record_type character varying(20) NOT NULL,
  record_value numeric(10,2) NOT NULL,
  weight_unit character varying(10) DEFAULT 'lbs'::character varying,
  achieved_date date NOT NULL,
  workout_log_id integer,
  previous_value numeric(10,2),
  previous_date date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.processed_webhook_events (
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  processed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.progress_photos (
  id integer DEFAULT nextval('progress_photos_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  photo_url text NOT NULL,
  storage_path text NOT NULL,
  photo_type character varying(50) DEFAULT 'progress'::character varying,
  notes text,
  taken_date date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.recipe_requests (
  id integer DEFAULT nextval('recipe_requests_id_seq'::regclass) NOT NULL,
  recipe_id integer,
  client_id integer,
  coach_id uuid,
  status character varying(20) DEFAULT 'pending'::character varying,
  client_note text,
  coach_response text,
  created_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone
);

CREATE TABLE public.recipes (
  id integer DEFAULT nextval('recipes_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  name character varying(500) NOT NULL,
  description text,
  time_category character varying(20) NOT NULL,
  prep_time_minutes integer,
  cook_time_minutes integer,
  servings integer DEFAULT 1,
  calories integer,
  protein numeric(5,1),
  carbs numeric(5,1),
  fat numeric(5,1),
  ingredients text,
  instructions text,
  image_url text,
  source_url text,
  source character varying(50) DEFAULT 'custom'::character varying,
  external_id character varying(255),
  tags jsonb DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.saved_custom_meals (
  id integer DEFAULT nextval('saved_custom_meals_id_seq'::regclass) NOT NULL,
  coach_id uuid,
  client_id integer,
  meal_data jsonb NOT NULL,
  meal_name character varying(1000) NOT NULL,
  meal_type character varying(50),
  calories integer,
  protein numeric(5,1),
  carbs numeric(5,1),
  fat numeric(5,1),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.shared_meal_plans (
  id bigint DEFAULT nextval('shared_meal_plans_id_seq'::regclass) NOT NULL,
  share_id character varying(20) NOT NULL,
  plan_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  coach_plan_id integer
);

CREATE TABLE public.shared_workout_programs (
  id bigint DEFAULT nextval('shared_workout_programs_id_seq'::regclass) NOT NULL,
  share_id character varying(20) NOT NULL,
  program_data jsonb NOT NULL,
  coach_id uuid,
  coach_program_id integer,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cta_url text,
  cta_label text
);

CREATE TABLE public.story_reactions (
  id bigint DEFAULT nextval('story_reactions_id_seq'::regclass) NOT NULL,
  story_id bigint NOT NULL,
  client_id bigint NOT NULL,
  reaction text NOT NULL,
  reacted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.story_replies (
  id bigint DEFAULT nextval('story_replies_id_seq'::regclass) NOT NULL,
  story_id bigint NOT NULL,
  client_id bigint NOT NULL,
  coach_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.story_views (
  id bigint DEFAULT nextval('story_views_id_seq'::regclass) NOT NULL,
  story_id bigint NOT NULL,
  client_id bigint NOT NULL,
  viewed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  coach_id uuid,
  moonclerk_subscription_id text,
  tier text NOT NULL,
  status text DEFAULT 'active'::text,
  renewal_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stripe_subscription_id text,
  trial_ends_at timestamp with time zone
);

CREATE TABLE public.supplement_intake (
  id bigint DEFAULT nextval('supplement_intake_id_seq'::regclass) NOT NULL,
  client_id bigint NOT NULL,
  protocol_id bigint NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  taken_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.supplement_library (
  id bigint DEFAULT nextval('supplement_library_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  category character varying(100),
  timing character varying(50) DEFAULT 'morning'::character varying,
  timing_custom character varying(255),
  dose character varying(255),
  has_schedule boolean DEFAULT false,
  schedule jsonb,
  notes text,
  private_notes text,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  frequency_type character varying(50) DEFAULT 'daily'::character varying,
  frequency_interval integer,
  frequency_days integer[],
  image_url text
);

CREATE TABLE public.water_intake (
  id integer DEFAULT nextval('water_intake_id_seq'::regclass) NOT NULL,
  client_id bigint NOT NULL,
  date date NOT NULL,
  glasses integer DEFAULT 0,
  goal integer DEFAULT 8,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.weight_proofs (
  id integer DEFAULT nextval('weight_proofs_id_seq'::regclass) NOT NULL,
  client_id integer,
  coach_id uuid,
  photo_url text NOT NULL,
  storage_path text NOT NULL,
  client_name character varying(255),
  weight numeric(6,2) NOT NULL,
  weight_unit character varying(10) DEFAULT 'lbs'::character varying NOT NULL,
  measurement_id integer,
  proof_date date DEFAULT CURRENT_DATE NOT NULL,
  proof_time timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workout_logs (
  id integer DEFAULT nextval('workout_logs_id_seq'::regclass) NOT NULL,
  client_id integer NOT NULL,
  coach_id uuid,
  assignment_id integer,
  workout_date date DEFAULT CURRENT_DATE NOT NULL,
  workout_name character varying(255),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_minutes integer,
  total_volume numeric(10,2),
  total_sets integer,
  total_reps integer,
  estimated_calories integer,
  notes text,
  energy_level integer,
  workout_rating integer,
  status character varying(20) DEFAULT 'completed'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workout_programs (
  id integer DEFAULT nextval('workout_programs_id_seq'::regclass) NOT NULL,
  coach_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  program_type character varying(50),
  difficulty character varying(20),
  duration_weeks integer,
  days_per_week integer,
  program_data jsonb DEFAULT '{}'::jsonb,
  is_template boolean DEFAULT true,
  is_published boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_club_workout boolean DEFAULT false
);

-- SEQUENCE OWNERSHIP
ALTER SEQUENCE public.activity_reactions_id_seq OWNED BY public.activity_reactions.id;
ALTER SEQUENCE public.ai_message_drafts_id_seq OWNED BY public.ai_message_drafts.id;
ALTER SEQUENCE public.ai_plateau_acknowledgements_id_seq OWNED BY public.ai_plateau_acknowledgements.id;
ALTER SEQUENCE public.calorie_goals_id_seq OWNED BY public.calorie_goals.id;
ALTER SEQUENCE public.challenge_participants_id_seq OWNED BY public.challenge_participants.id;
ALTER SEQUENCE public.challenge_progress_id_seq OWNED BY public.challenge_progress.id;
ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;
ALTER SEQUENCE public.checkin_reminder_log_id_seq OWNED BY public.checkin_reminder_log.id;
ALTER SEQUENCE public.checkin_reminder_settings_id_seq OWNED BY public.checkin_reminder_settings.id;
ALTER SEQUENCE public.client_checkins_id_seq OWNED BY public.client_checkins.id;
ALTER SEQUENCE public.client_exercise_personal_notes_id_seq OWNED BY public.client_exercise_personal_notes.id;
ALTER SEQUENCE public.client_measurements_id_seq OWNED BY public.client_measurements.id;
ALTER SEQUENCE public.client_protocols_id_seq OWNED BY public.client_protocols.id;
ALTER SEQUENCE public.client_reminder_preferences_id_seq OWNED BY public.client_reminder_preferences.id;
ALTER SEQUENCE public.client_workout_assignments_id_seq OWNED BY public.client_workout_assignments.id;
ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;
ALTER SEQUENCE public.club_workouts_id_seq OWNED BY public.club_workouts.id;
ALTER SEQUENCE public.coach_challenges_id_seq OWNED BY public.coach_challenges.id;
ALTER SEQUENCE public.coach_command_center_pins_id_seq OWNED BY public.coach_command_center_pins.id;
ALTER SEQUENCE public.coach_daily_briefings_id_seq OWNED BY public.coach_daily_briefings.id;
ALTER SEQUENCE public.coach_exercise_references_id_seq OWNED BY public.coach_exercise_references.id;
ALTER SEQUENCE public.coach_meal_plans_id_seq OWNED BY public.coach_meal_plans.id;
ALTER SEQUENCE public.coach_settings_id_seq OWNED BY public.coach_settings.id;
ALTER SEQUENCE public.coach_stories_id_seq OWNED BY public.coach_stories.id;
ALTER SEQUENCE public.coach_story_highlights_id_seq OWNED BY public.coach_story_highlights.id;
ALTER SEQUENCE public.diary_entry_comments_id_seq OWNED BY public.diary_entry_comments.id;
ALTER SEQUENCE public.diary_entry_reactions_id_seq OWNED BY public.diary_entry_reactions.id;
ALTER SEQUENCE public.dismissed_activity_items_id_seq OWNED BY public.dismissed_activity_items.id;
ALTER SEQUENCE public.exercise_logs_id_seq OWNED BY public.exercise_logs.id;
ALTER SEQUENCE public.exercises_id_seq OWNED BY public.exercises.id;
ALTER SEQUENCE public.food_diary_entries_id_seq OWNED BY public.food_diary_entries.id;
ALTER SEQUENCE public.form_responses_id_seq OWNED BY public.form_responses.id;
ALTER SEQUENCE public.form_templates_id_seq OWNED BY public.form_templates.id;
ALTER SEQUENCE public.gym_proofs_id_seq OWNED BY public.gym_proofs.id;
ALTER SEQUENCE public.master_account_audit_id_seq OWNED BY public.master_account_audit.id;
ALTER SEQUENCE public.meal_favorites_id_seq OWNED BY public.meal_favorites.id;
ALTER SEQUENCE public.meal_images_id_seq OWNED BY public.meal_images.id;
ALTER SEQUENCE public.meal_plan_templates_id_seq OWNED BY public.meal_plan_templates.id;
ALTER SEQUENCE public.notification_delivery_log_id_seq OWNED BY public.notification_delivery_log.id;
ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;
ALTER SEQUENCE public.pep_talks_id_seq OWNED BY public.pep_talks.id;
ALTER SEQUENCE public.personal_records_id_seq OWNED BY public.personal_records.id;
ALTER SEQUENCE public.progress_photos_id_seq OWNED BY public.progress_photos.id;
ALTER SEQUENCE public.recipe_requests_id_seq OWNED BY public.recipe_requests.id;
ALTER SEQUENCE public.recipes_id_seq OWNED BY public.recipes.id;
ALTER SEQUENCE public.saved_custom_meals_id_seq OWNED BY public.saved_custom_meals.id;
ALTER SEQUENCE public.shared_meal_plans_id_seq OWNED BY public.shared_meal_plans.id;
ALTER SEQUENCE public.shared_workout_programs_id_seq OWNED BY public.shared_workout_programs.id;
ALTER SEQUENCE public.story_reactions_id_seq OWNED BY public.story_reactions.id;
ALTER SEQUENCE public.story_replies_id_seq OWNED BY public.story_replies.id;
ALTER SEQUENCE public.story_views_id_seq OWNED BY public.story_views.id;
ALTER SEQUENCE public.supplement_intake_id_seq OWNED BY public.supplement_intake.id;
ALTER SEQUENCE public.supplement_library_id_seq OWNED BY public.supplement_library.id;
ALTER SEQUENCE public.water_intake_id_seq OWNED BY public.water_intake.id;
ALTER SEQUENCE public.weight_proofs_id_seq OWNED BY public.weight_proofs.id;
ALTER SEQUENCE public.workout_logs_id_seq OWNED BY public.workout_logs.id;
ALTER SEQUENCE public.workout_programs_id_seq OWNED BY public.workout_programs.id;

-- PRIMARY/UNIQUE/CHECK CONSTRAINTS
ALTER TABLE ONLY public.activity_reactions ADD CONSTRAINT activity_reactions_coach_id_item_type_item_id_key UNIQUE (coach_id, item_type, item_id);
ALTER TABLE ONLY public.activity_reactions ADD CONSTRAINT activity_reactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_message_drafts ADD CONSTRAINT ai_message_drafts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_plateau_acknowledgements ADD CONSTRAINT ai_plateau_acknowledgements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.calorie_goals ADD CONSTRAINT calorie_goals_client_id_key UNIQUE (client_id);
ALTER TABLE ONLY public.calorie_goals ADD CONSTRAINT calorie_goals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.challenge_participants ADD CONSTRAINT challenge_participants_challenge_id_client_id_key UNIQUE (challenge_id, client_id);
ALTER TABLE ONLY public.challenge_participants ADD CONSTRAINT challenge_participants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.challenge_progress ADD CONSTRAINT challenge_progress_challenge_id_client_id_log_date_key UNIQUE (challenge_id, client_id, log_date);
ALTER TABLE ONLY public.challenge_progress ADD CONSTRAINT challenge_progress_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying, 'gif'::character varying])::text[])));
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['coach'::character varying, 'client'::character varying])::text[])));
ALTER TABLE ONLY public.checkin_reminder_log ADD CONSTRAINT checkin_reminder_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_coach_id_key UNIQUE (coach_id);
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_days_before_deadline_check CHECK (((days_before_deadline >= 0) AND (days_before_deadline <= 7)));
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_followup_hours_check CHECK (((followup_hours >= 1) AND (followup_hours <= 72)));
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_reminder_day_check CHECK (((reminder_day >= 0) AND (reminder_day <= 6)));
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_reminder_hour_check CHECK (((reminder_hour >= 0) AND (reminder_hour <= 23)));
ALTER TABLE ONLY public.client_adhoc_workouts ADD CONSTRAINT client_adhoc_workouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_adhoc_workouts ADD CONSTRAINT unique_client_adhoc_date UNIQUE (client_id, workout_date);
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_energy_level_check CHECK (((energy_level >= 1) AND (energy_level <= 5)));
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_hunger_level_check CHECK (((hunger_level >= 1) AND (hunger_level <= 5)));
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_meal_plan_adherence_check CHECK (((meal_plan_adherence >= 0) AND (meal_plan_adherence <= 100)));
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_sleep_quality_check CHECK (((sleep_quality >= 1) AND (sleep_quality <= 5)));
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_stress_level_check CHECK (((stress_level >= 1) AND (stress_level <= 5)));
ALTER TABLE ONLY public.client_exercise_personal_notes ADD CONSTRAINT client_exercise_personal_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_measurements ADD CONSTRAINT client_measurements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_payments ADD CONSTRAINT client_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_payments ADD CONSTRAINT client_payments_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'pending'::text, 'refunded'::text])));
ALTER TABLE ONLY public.client_protocols ADD CONSTRAINT client_protocols_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_client_id_key UNIQUE (client_id);
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_custom_reminder_day_check CHECK (((custom_reminder_day IS NULL) OR ((custom_reminder_day >= 0) AND (custom_reminder_day <= 6))));
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_preferred_hour_check CHECK (((preferred_hour IS NULL) OR ((preferred_hour >= 0) AND (preferred_hour <= 23))));
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_client_coach_unique UNIQUE (client_id, coach_id);
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'canceled'::text, 'canceling'::text, 'incomplete'::text, 'paused'::text])));
ALTER TABLE ONLY public.client_workout_assignments ADD CONSTRAINT client_workout_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_access_status_check CHECK ((access_status = ANY (ARRAY['active'::text, 'paused'::text])));
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.club_workouts ADD CONSTRAINT club_workouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_challenges ADD CONSTRAINT coach_challenges_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_command_center_pins ADD CONSTRAINT coach_command_center_pins_coach_id_item_type_item_ref_key UNIQUE (coach_id, item_type, item_ref);
ALTER TABLE ONLY public.coach_command_center_pins ADD CONSTRAINT coach_command_center_pins_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_daily_briefings ADD CONSTRAINT coach_daily_briefings_coach_id_briefing_date_key UNIQUE (coach_id, briefing_date);
ALTER TABLE ONLY public.coach_daily_briefings ADD CONSTRAINT coach_daily_briefings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_exercise_references ADD CONSTRAINT coach_exercise_references_coach_id_exercise_name_key UNIQUE (coach_id, exercise_name);
ALTER TABLE ONLY public.coach_exercise_references ADD CONSTRAINT coach_exercise_references_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_meal_plans ADD CONSTRAINT coach_meal_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_payment_plans ADD CONSTRAINT coach_payment_plans_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['week'::text, 'month'::text])));
ALTER TABLE ONLY public.coach_payment_plans ADD CONSTRAINT coach_payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_payment_plans ADD CONSTRAINT coach_payment_plans_type_check CHECK ((type = ANY (ARRAY['subscription'::text, 'one_time'::text, 'tier'::text])));
ALTER TABLE ONLY public.coach_promo_codes ADD CONSTRAINT coach_promo_codes_coach_id_code_key UNIQUE (coach_id, code);
ALTER TABLE ONLY public.coach_promo_codes ADD CONSTRAINT coach_promo_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])));
ALTER TABLE ONLY public.coach_promo_codes ADD CONSTRAINT coach_promo_codes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_settings ADD CONSTRAINT coach_settings_coach_id_key UNIQUE (coach_id);
ALTER TABLE ONLY public.coach_settings ADD CONSTRAINT coach_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_stories ADD CONSTRAINT coach_stories_content_type_check CHECK ((content_type = ANY (ARRAY['image'::text, 'quote'::text, 'link'::text])));
ALTER TABLE ONLY public.coach_stories ADD CONSTRAINT coach_stories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coach_story_highlights ADD CONSTRAINT coach_story_highlights_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_brand_client_theme_check CHECK (((brand_client_theme)::text = ANY ((ARRAY['light'::character varying, 'dark'::character varying, 'system'::character varying])::text[])));
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_email_key UNIQUE (email);
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_signup_code_key UNIQUE (signup_code);
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['starter'::text, 'growth'::text, 'professional'::text, 'basic'::text, 'branded'::text, 'none'::text])));
ALTER TABLE ONLY public.coaches ADD CONSTRAINT coaches_unit_preference_check CHECK ((unit_preference = ANY (ARRAY['imperial'::text, 'metric'::text])));
ALTER TABLE ONLY public.contact_submissions ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diary_entry_comments ADD CONSTRAINT diary_entry_comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diary_entry_reactions ADD CONSTRAINT diary_entry_reactions_entry_id_coach_id_key UNIQUE (entry_id, coach_id);
ALTER TABLE ONLY public.diary_entry_reactions ADD CONSTRAINT diary_entry_reactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dismissed_activity_items ADD CONSTRAINT dismissed_activity_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dismissed_activity_items ADD CONSTRAINT unique_dismissal UNIQUE (coach_id, client_id, reason, related_checkin_id);
ALTER TABLE ONLY public.exercise_logs ADD CONSTRAINT exercise_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.exercise_logs ADD CONSTRAINT exercise_logs_workout_exercise_unique UNIQUE (workout_log_id, exercise_id);
ALTER TABLE ONLY public.exercises ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.food_diary_entries ADD CONSTRAINT food_diary_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.form_responses ADD CONSTRAINT form_responses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.form_templates ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.form_templates ADD CONSTRAINT form_templates_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.gym_proofs ADD CONSTRAINT gym_proofs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.master_account_audit ADD CONSTRAINT master_account_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meal_favorites ADD CONSTRAINT meal_favorites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meal_images ADD CONSTRAINT meal_images_normalized_name_key UNIQUE (normalized_name);
ALTER TABLE ONLY public.meal_images ADD CONSTRAINT meal_images_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meal_plan_templates ADD CONSTRAINT meal_plan_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meal_plans ADD CONSTRAINT meal_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meal_plans ADD CONSTRAINT meal_plans_shareable_token_key UNIQUE (shareable_token);
ALTER TABLE ONLY public.notification_delivery_log ADD CONSTRAINT notification_delivery_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pep_talk_recipients ADD CONSTRAINT pep_talk_recipients_pkey PRIMARY KEY (pep_talk_id, client_id);
ALTER TABLE ONLY public.pep_talk_views ADD CONSTRAINT pep_talk_views_pkey PRIMARY KEY (pep_talk_id, client_id);
ALTER TABLE ONLY public.pep_talks ADD CONSTRAINT pep_talks_has_content CHECK ((((body IS NOT NULL) AND (length(TRIM(BOTH FROM body)) > 0)) OR (video_url IS NOT NULL)));
ALTER TABLE ONLY public.pep_talks ADD CONSTRAINT pep_talks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pep_talks ADD CONSTRAINT pep_talks_recipient_type_check CHECK (((recipient_type)::text = ANY ((ARRAY['all'::character varying, 'specific'::character varying])::text[])));
ALTER TABLE ONLY public.personal_records ADD CONSTRAINT personal_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.processed_webhook_events ADD CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (stripe_event_id, source);
ALTER TABLE ONLY public.processed_webhook_events ADD CONSTRAINT processed_webhook_events_source_check CHECK ((source = ANY (ARRAY['platform'::text, 'connect'::text])));
ALTER TABLE ONLY public.progress_photos ADD CONSTRAINT progress_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_requests ADD CONSTRAINT recipe_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_requests ADD CONSTRAINT recipe_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'declined'::character varying])::text[])));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_time_category_check CHECK (((time_category)::text = ANY ((ARRAY['grab_go'::character varying, 'quick'::character varying, 'meal_prep'::character varying, 'family'::character varying])::text[])));
ALTER TABLE ONLY public.saved_custom_meals ADD CONSTRAINT saved_custom_meals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.saved_custom_meals ADD CONSTRAINT saved_meal_owner CHECK ((((coach_id IS NOT NULL) AND (client_id IS NULL)) OR ((coach_id IS NULL) AND (client_id IS NOT NULL))));
ALTER TABLE ONLY public.shared_meal_plans ADD CONSTRAINT shared_meal_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shared_meal_plans ADD CONSTRAINT shared_meal_plans_share_id_key UNIQUE (share_id);
ALTER TABLE ONLY public.shared_workout_programs ADD CONSTRAINT shared_workout_programs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shared_workout_programs ADD CONSTRAINT shared_workout_programs_share_id_key UNIQUE (share_id);
ALTER TABLE ONLY public.story_reactions ADD CONSTRAINT story_reactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.story_reactions ADD CONSTRAINT story_reactions_story_id_client_id_key UNIQUE (story_id, client_id);
ALTER TABLE ONLY public.story_replies ADD CONSTRAINT story_replies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.story_views ADD CONSTRAINT story_views_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.story_views ADD CONSTRAINT story_views_story_id_client_id_key UNIQUE (story_id, client_id);
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_coach_id_key UNIQUE (coach_id);
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_tier_check CHECK ((tier = ANY (ARRAY['basic'::text, 'branded'::text])));
ALTER TABLE ONLY public.supplement_intake ADD CONSTRAINT supplement_intake_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.supplement_library ADD CONSTRAINT supplement_library_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.water_intake ADD CONSTRAINT water_intake_client_id_date_key UNIQUE (client_id, date);
ALTER TABLE ONLY public.water_intake ADD CONSTRAINT water_intake_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.weight_proofs ADD CONSTRAINT weight_proofs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_client_date_unique UNIQUE (client_id, workout_date);
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_energy_level_check CHECK (((energy_level >= 1) AND (energy_level <= 5)));
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_workout_rating_check CHECK (((workout_rating >= 1) AND (workout_rating <= 5)));
ALTER TABLE ONLY public.workout_programs ADD CONSTRAINT workout_programs_pkey PRIMARY KEY (id);

-- FOREIGN KEYS
ALTER TABLE ONLY public.activity_reactions ADD CONSTRAINT activity_reactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.activity_reactions ADD CONSTRAINT activity_reactions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.calorie_goals ADD CONSTRAINT calorie_goals_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.calorie_goals ADD CONSTRAINT calorie_goals_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.challenge_participants ADD CONSTRAINT challenge_participants_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES coach_challenges(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.challenge_participants ADD CONSTRAINT challenge_participants_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.challenge_progress ADD CONSTRAINT challenge_progress_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES coach_challenges(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.challenge_progress ADD CONSTRAINT challenge_progress_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkin_reminder_log ADD CONSTRAINT checkin_reminder_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkin_reminder_log ADD CONSTRAINT checkin_reminder_log_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkin_reminder_settings ADD CONSTRAINT checkin_reminder_settings_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_adhoc_workouts ADD CONSTRAINT client_adhoc_workouts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_checkins ADD CONSTRAINT client_checkins_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_exercise_personal_notes ADD CONSTRAINT client_exercise_personal_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_measurements ADD CONSTRAINT client_measurements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_measurements ADD CONSTRAINT client_measurements_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_payments ADD CONSTRAINT client_payments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_payments ADD CONSTRAINT client_payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES coach_payment_plans(id);
ALTER TABLE ONLY public.client_payments ADD CONSTRAINT client_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES client_subscriptions(id);
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_reminder_preferences ADD CONSTRAINT client_reminder_preferences_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES coach_payment_plans(id);
ALTER TABLE ONLY public.client_subscriptions ADD CONSTRAINT client_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES coach_payment_plans(id);
ALTER TABLE ONLY public.client_workout_assignments ADD CONSTRAINT client_workout_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_workout_assignments ADD CONSTRAINT client_workout_assignments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_workout_assignments ADD CONSTRAINT client_workout_assignments_program_id_fkey FOREIGN KEY (program_id) REFERENCES workout_programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.club_workouts ADD CONSTRAINT club_workouts_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_challenges ADD CONSTRAINT coach_challenges_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_exercise_references ADD CONSTRAINT coach_exercise_references_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_meal_plans ADD CONSTRAINT coach_meal_plans_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.coach_meal_plans ADD CONSTRAINT coach_meal_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_payment_plans ADD CONSTRAINT coach_payment_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_promo_codes ADD CONSTRAINT coach_promo_codes_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_settings ADD CONSTRAINT coach_settings_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_stories ADD CONSTRAINT coach_stories_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coach_story_highlights ADD CONSTRAINT coach_story_highlights_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_comments ADD CONSTRAINT diary_entry_comments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_comments ADD CONSTRAINT diary_entry_comments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_comments ADD CONSTRAINT diary_entry_comments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES food_diary_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_comments ADD CONSTRAINT diary_entry_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES diary_entry_comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_reactions ADD CONSTRAINT diary_entry_reactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_reactions ADD CONSTRAINT diary_entry_reactions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diary_entry_reactions ADD CONSTRAINT diary_entry_reactions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES food_diary_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dismissed_activity_items ADD CONSTRAINT dismissed_activity_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dismissed_activity_items ADD CONSTRAINT dismissed_activity_items_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.exercise_logs ADD CONSTRAINT exercise_logs_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.exercise_logs ADD CONSTRAINT exercise_logs_workout_log_id_fkey FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.exercises ADD CONSTRAINT exercises_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.food_diary_entries ADD CONSTRAINT food_diary_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.food_diary_entries ADD CONSTRAINT food_diary_entries_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.form_responses ADD CONSTRAINT form_responses_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.form_templates ADD CONSTRAINT form_templates_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gym_proofs ADD CONSTRAINT gym_proofs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gym_proofs ADD CONSTRAINT gym_proofs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meal_favorites ADD CONSTRAINT meal_favorites_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meal_favorites ADD CONSTRAINT meal_favorites_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meal_plan_templates ADD CONSTRAINT meal_plan_templates_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id);
ALTER TABLE ONLY public.meal_plans ADD CONSTRAINT meal_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_related_checkin_id_fkey FOREIGN KEY (related_checkin_id) REFERENCES client_checkins(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_related_client_id_fkey FOREIGN KEY (related_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pep_talk_recipients ADD CONSTRAINT pep_talk_recipients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pep_talk_recipients ADD CONSTRAINT pep_talk_recipients_pep_talk_id_fkey FOREIGN KEY (pep_talk_id) REFERENCES pep_talks(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pep_talk_views ADD CONSTRAINT pep_talk_views_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pep_talk_views ADD CONSTRAINT pep_talk_views_pep_talk_id_fkey FOREIGN KEY (pep_talk_id) REFERENCES pep_talks(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pep_talks ADD CONSTRAINT pep_talks_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.personal_records ADD CONSTRAINT personal_records_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.personal_records ADD CONSTRAINT personal_records_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.personal_records ADD CONSTRAINT personal_records_workout_log_id_fkey FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.progress_photos ADD CONSTRAINT progress_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.progress_photos ADD CONSTRAINT progress_photos_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_requests ADD CONSTRAINT recipe_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_requests ADD CONSTRAINT recipe_requests_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_requests ADD CONSTRAINT recipe_requests_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.saved_custom_meals ADD CONSTRAINT saved_custom_meals_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.saved_custom_meals ADD CONSTRAINT saved_custom_meals_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shared_meal_plans ADD CONSTRAINT shared_meal_plans_coach_plan_id_fkey FOREIGN KEY (coach_plan_id) REFERENCES coach_meal_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shared_workout_programs ADD CONSTRAINT shared_workout_programs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.shared_workout_programs ADD CONSTRAINT shared_workout_programs_coach_program_id_fkey FOREIGN KEY (coach_program_id) REFERENCES workout_programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.story_reactions ADD CONSTRAINT story_reactions_story_id_fkey FOREIGN KEY (story_id) REFERENCES coach_stories(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.story_replies ADD CONSTRAINT story_replies_story_id_fkey FOREIGN KEY (story_id) REFERENCES coach_stories(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.story_views ADD CONSTRAINT story_views_story_id_fkey FOREIGN KEY (story_id) REFERENCES coach_stories(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.supplement_intake ADD CONSTRAINT supplement_intake_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.supplement_intake ADD CONSTRAINT supplement_intake_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES client_protocols(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.supplement_library ADD CONSTRAINT supplement_library_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.water_intake ADD CONSTRAINT water_intake_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.weight_proofs ADD CONSTRAINT weight_proofs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.weight_proofs ADD CONSTRAINT weight_proofs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.weight_proofs ADD CONSTRAINT weight_proofs_measurement_id_fkey FOREIGN KEY (measurement_id) REFERENCES client_measurements(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES client_workout_assignments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workout_logs ADD CONSTRAINT workout_logs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workout_programs ADD CONSTRAINT workout_programs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- INDEXES
CREATE INDEX clients_health_flags_idx ON public.clients USING gin (health_flags);
CREATE UNIQUE INDEX exercises_name_gender_unique ON public.exercises USING btree (name, COALESCE(gender_variant, 'unisex'::character varying));
CREATE INDEX idx_activity_reactions_client ON public.activity_reactions USING btree (client_id);
CREATE INDEX idx_activity_reactions_coach ON public.activity_reactions USING btree (coach_id);
CREATE INDEX idx_activity_reactions_item ON public.activity_reactions USING btree (item_type, item_id);
CREATE INDEX idx_adhoc_workouts_active ON public.client_adhoc_workouts USING btree (client_id, is_active) WHERE (is_active = true);
CREATE INDEX idx_adhoc_workouts_client_date ON public.client_adhoc_workouts USING btree (client_id, workout_date);
CREATE INDEX idx_ai_message_drafts_client ON public.ai_message_drafts USING btree (client_id);
CREATE INDEX idx_ai_message_drafts_coach ON public.ai_message_drafts USING btree (coach_id, created_at DESC);
CREATE INDEX idx_ai_plateau_ack_coach_client ON public.ai_plateau_acknowledgements USING btree (coach_id, client_id);
CREATE INDEX idx_assignments_active ON public.client_workout_assignments USING btree (client_id, is_active);
CREATE INDEX idx_assignments_client ON public.client_workout_assignments USING btree (client_id);
CREATE INDEX idx_assignments_coach ON public.client_workout_assignments USING btree (coach_id);
CREATE INDEX idx_audit_log_action_created ON public.audit_log USING btree (action, created_at DESC);
CREATE INDEX idx_audit_log_actor_created ON public.audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX idx_audit_log_tenant_created ON public.audit_log USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_challenges_coach ON public.coach_challenges USING btree (coach_id);
CREATE INDEX idx_challenges_status ON public.coach_challenges USING btree (status, start_date, end_date);
CREATE INDEX idx_chat_messages_client ON public.chat_messages USING btree (client_id, created_at DESC);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (coach_id, client_id, created_at DESC);
CREATE INDEX idx_chat_messages_unread ON public.chat_messages USING btree (coach_id, client_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_checkins_client_date ON public.client_checkins USING btree (client_id, checkin_date DESC);
CREATE INDEX idx_client_payments_client ON public.client_payments USING btree (client_id);
CREATE INDEX idx_client_payments_coach ON public.client_payments USING btree (coach_id);
CREATE INDEX idx_client_payments_created ON public.client_payments USING btree (coach_id, created_at DESC);
CREATE INDEX idx_client_personal_notes_lookup ON public.client_exercise_personal_notes USING btree (client_id, lower((exercise_name)::text), created_at DESC);
CREATE INDEX idx_client_protocols_client ON public.client_protocols USING btree (client_id);
CREATE INDEX idx_client_protocols_coach ON public.client_protocols USING btree (coach_id);
CREATE INDEX idx_client_protocols_coach_client ON public.client_protocols USING btree (coach_id, client_id);
CREATE INDEX idx_client_reminder_prefs_client ON public.client_reminder_preferences USING btree (client_id);
CREATE INDEX idx_client_reminder_prefs_coach ON public.client_reminder_preferences USING btree (coach_id);
CREATE INDEX idx_client_subscriptions_client ON public.client_subscriptions USING btree (client_id);
CREATE INDEX idx_client_subscriptions_coach ON public.client_subscriptions USING btree (coach_id);
CREATE INDEX idx_client_subscriptions_schedule ON public.client_subscriptions USING btree (stripe_schedule_id) WHERE (stripe_schedule_id IS NOT NULL);
CREATE INDEX idx_client_subscriptions_stripe ON public.client_subscriptions USING btree (stripe_subscription_id);
CREATE INDEX idx_clients_coach_id ON public.clients USING btree (coach_id);
CREATE INDEX idx_clients_created_at ON public.clients USING btree (created_at DESC);
CREATE INDEX idx_clients_deleted_at ON public.clients USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_clients_intake_token ON public.clients USING btree (intake_token) WHERE (intake_token IS NOT NULL);
CREATE INDEX idx_clients_is_archived ON public.clients USING btree (coach_id, is_archived);
CREATE INDEX idx_clients_is_demo ON public.clients USING btree (coach_id) WHERE (is_demo = true);
CREATE INDEX idx_clients_is_sample ON public.clients USING btree (coach_id) WHERE (is_sample = true);
CREATE INDEX idx_clients_last_activity ON public.clients USING btree (last_activity_at);
CREATE INDEX idx_clients_name ON public.clients USING btree (client_name);
CREATE INDEX idx_clients_unit_preference ON public.clients USING btree (unit_preference);
CREATE INDEX idx_clients_user_id ON public.clients USING btree (user_id);
CREATE INDEX idx_club_workouts_active ON public.club_workouts USING btree (coach_id, is_active) WHERE (is_active = true);
CREATE INDEX idx_club_workouts_category ON public.club_workouts USING btree (category);
CREATE INDEX idx_club_workouts_coach ON public.club_workouts USING btree (coach_id);
CREATE INDEX idx_coach_daily_briefings_coach_date ON public.coach_daily_briefings USING btree (coach_id, briefing_date DESC);
CREATE INDEX idx_coach_exercise_refs_coach_id ON public.coach_exercise_references USING btree (coach_id);
CREATE INDEX idx_coach_exercise_refs_lookup ON public.coach_exercise_references USING btree (coach_id, exercise_name);
CREATE INDEX idx_coach_meal_plans_client_id ON public.coach_meal_plans USING btree (client_id);
CREATE INDEX idx_coach_meal_plans_coach_id ON public.coach_meal_plans USING btree (coach_id);
CREATE INDEX idx_coach_meal_plans_created_at ON public.coach_meal_plans USING btree (created_at DESC);
CREATE INDEX idx_coach_payment_plans_active ON public.coach_payment_plans USING btree (coach_id, is_active);
CREATE INDEX idx_coach_payment_plans_coach_id ON public.coach_payment_plans USING btree (coach_id);
CREATE INDEX idx_coach_pins_coach ON public.coach_command_center_pins USING btree (coach_id);
CREATE INDEX idx_coach_promo_codes_coach ON public.coach_promo_codes USING btree (coach_id);
CREATE INDEX idx_coach_promo_codes_code ON public.coach_promo_codes USING btree (coach_id, code);
CREATE INDEX idx_coach_stories_coach_id ON public.coach_stories USING btree (coach_id);
CREATE INDEX idx_coach_stories_created_at ON public.coach_stories USING btree (created_at);
CREATE INDEX idx_coaches_deleted_at ON public.coaches USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_coaches_email ON public.coaches USING btree (email);
CREATE INDEX idx_coaches_moonclerk_id ON public.coaches USING btree (moonclerk_customer_id);
CREATE INDEX idx_coaches_signup_code ON public.coaches USING btree (signup_code) WHERE (signup_code IS NOT NULL);
CREATE INDEX idx_coaches_stripe_customer ON public.coaches USING btree (stripe_customer_id);
CREATE INDEX idx_coaches_stripe_subscription ON public.coaches USING btree (stripe_subscription_id);
CREATE INDEX idx_coaches_subscription_status ON public.coaches USING btree (subscription_status);
CREATE INDEX idx_diary_client_date ON public.food_diary_entries USING btree (client_id, entry_date DESC);
CREATE INDEX idx_diary_comments_client ON public.diary_entry_comments USING btree (client_id);
CREATE INDEX idx_diary_comments_coach ON public.diary_entry_comments USING btree (coach_id);
CREATE INDEX idx_diary_comments_created ON public.diary_entry_comments USING btree (created_at DESC);
CREATE INDEX idx_diary_comments_entry ON public.diary_entry_comments USING btree (entry_id);
CREATE INDEX idx_diary_full_query ON public.food_diary_entries USING btree (client_id, entry_date, meal_type, created_at);
CREATE INDEX idx_diary_meal_type ON public.food_diary_entries USING btree (client_id, entry_date, meal_type);
CREATE INDEX idx_diary_reactions_client ON public.diary_entry_reactions USING btree (client_id);
CREATE INDEX idx_diary_reactions_coach ON public.diary_entry_reactions USING btree (coach_id);
CREATE INDEX idx_diary_reactions_entry ON public.diary_entry_reactions USING btree (entry_id);
CREATE INDEX idx_dismissed_activity_client_id ON public.dismissed_activity_items USING btree (client_id);
CREATE INDEX idx_dismissed_activity_coach_id ON public.dismissed_activity_items USING btree (coach_id);
CREATE INDEX idx_exercise_logs_exercise ON public.exercise_logs USING btree (exercise_id);
CREATE INDEX idx_exercise_logs_workout ON public.exercise_logs USING btree (workout_log_id);
CREATE INDEX idx_exercises_category ON public.exercises USING btree (category);
CREATE INDEX idx_exercises_coach ON public.exercises USING btree (coach_id);
CREATE INDEX idx_exercises_equipment ON public.exercises USING btree (equipment);
CREATE INDEX idx_exercises_muscle ON public.exercises USING btree (muscle_group);
CREATE INDEX idx_exercises_name ON public.exercises USING btree (name);
CREATE INDEX idx_exercises_source ON public.exercises USING btree (source);
CREATE INDEX idx_exercises_type ON public.exercises USING btree (exercise_type);
CREATE INDEX idx_favorites_client ON public.meal_favorites USING btree (client_id);
CREATE INDEX idx_form_responses_is_read ON public.form_responses USING btree (is_read);
CREATE INDEX idx_form_responses_submitted_at ON public.form_responses USING btree (submitted_at DESC);
CREATE INDEX idx_gym_proofs_client_date ON public.gym_proofs USING btree (client_id, proof_date DESC);
CREATE INDEX idx_gym_proofs_coach_date ON public.gym_proofs USING btree (coach_id, proof_date DESC);
CREATE INDEX idx_master_account_audit_actor ON public.master_account_audit USING btree (actor_user_id);
CREATE INDEX idx_master_account_audit_created ON public.master_account_audit USING btree (created_at DESC);
CREATE INDEX idx_meal_favorites_client_recency ON public.meal_favorites USING btree (client_id, COALESCE(last_used_at, created_at) DESC);
CREATE INDEX idx_meal_images_normalized_name ON public.meal_images USING btree (normalized_name);
CREATE INDEX idx_meal_plans_coach_id ON public.meal_plans USING btree (coach_id);
CREATE INDEX idx_meal_plans_shareable_token ON public.meal_plans USING btree (shareable_token);
CREATE INDEX idx_measurements_client_date ON public.client_measurements USING btree (client_id, measured_date DESC);
CREATE INDEX idx_notification_delivery_log_delivered ON public.notification_delivery_log USING btree (delivered_at DESC);
CREATE INDEX idx_notification_delivery_log_notification ON public.notification_delivery_log USING btree (notification_id);
CREATE INDEX idx_notifications_client ON public.notifications USING btree (client_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read, created_at DESC);
CREATE INDEX idx_participants_challenge ON public.challenge_participants USING btree (challenge_id);
CREATE INDEX idx_participants_client ON public.challenge_participants USING btree (client_id);
CREATE INDEX idx_pep_talk_recipients_client ON public.pep_talk_recipients USING btree (client_id);
CREATE INDEX idx_pep_talk_views_unviewed ON public.pep_talk_views USING btree (client_id, viewed_at) WHERE (viewed_at IS NULL);
CREATE INDEX idx_pep_talks_coach ON public.pep_talks USING btree (coach_id, archived, created_at DESC);
CREATE INDEX idx_pr_client ON public.personal_records USING btree (client_id);
CREATE INDEX idx_pr_exercise ON public.personal_records USING btree (client_id, exercise_id);
CREATE INDEX idx_processed_webhook_events_at ON public.processed_webhook_events USING btree (processed_at DESC);
CREATE INDEX idx_programs_coach ON public.workout_programs USING btree (coach_id);
CREATE INDEX idx_programs_type ON public.workout_programs USING btree (program_type);
CREATE INDEX idx_progress_challenge_date ON public.challenge_progress USING btree (challenge_id, log_date DESC);
CREATE INDEX idx_progress_client ON public.challenge_progress USING btree (client_id, log_date DESC);
CREATE INDEX idx_protocols_client_id ON public.client_protocols USING btree (client_id);
CREATE INDEX idx_protocols_coach_id ON public.client_protocols USING btree (coach_id);
CREATE INDEX idx_recipe_requests_client ON public.recipe_requests USING btree (client_id);
CREATE INDEX idx_recipe_requests_coach ON public.recipe_requests USING btree (coach_id);
CREATE INDEX idx_recipe_requests_status ON public.recipe_requests USING btree (status);
CREATE INDEX idx_recipes_category ON public.recipes USING btree (time_category);
CREATE INDEX idx_recipes_coach ON public.recipes USING btree (coach_id) WHERE (coach_id IS NOT NULL);
CREATE INDEX idx_recipes_public ON public.recipes USING btree (is_public) WHERE (is_public = true);
CREATE INDEX idx_reminder_log_client ON public.checkin_reminder_log USING btree (client_id, created_at DESC);
CREATE INDEX idx_reminder_log_coach ON public.checkin_reminder_log USING btree (coach_id, created_at DESC);
CREATE INDEX idx_reminder_log_week ON public.checkin_reminder_log USING btree (checkin_week_start);
CREATE INDEX idx_reminder_settings_coach ON public.checkin_reminder_settings USING btree (coach_id);
CREATE INDEX idx_saved_meals_client ON public.saved_custom_meals USING btree (client_id) WHERE (client_id IS NOT NULL);
CREATE INDEX idx_saved_meals_coach ON public.saved_custom_meals USING btree (coach_id) WHERE (coach_id IS NOT NULL);
CREATE INDEX idx_shared_meal_plans_share_id ON public.shared_meal_plans USING btree (share_id);
CREATE INDEX idx_shared_plans_coach_plan_id ON public.shared_meal_plans USING btree (coach_plan_id);
CREATE INDEX idx_shared_workout_programs_coach_program_id ON public.shared_workout_programs USING btree (coach_program_id);
CREATE INDEX idx_shared_workout_programs_expires_at ON public.shared_workout_programs USING btree (expires_at);
CREATE INDEX idx_shared_workout_programs_share_id ON public.shared_workout_programs USING btree (share_id);
CREATE INDEX idx_story_reactions_story_id ON public.story_reactions USING btree (story_id);
CREATE INDEX idx_story_replies_coach_id ON public.story_replies USING btree (coach_id);
CREATE INDEX idx_story_replies_story_id ON public.story_replies USING btree (story_id);
CREATE INDEX idx_story_views_client_id ON public.story_views USING btree (client_id);
CREATE INDEX idx_story_views_story_id ON public.story_views USING btree (story_id);
CREATE INDEX idx_subscriptions_coach_id ON public.subscriptions USING btree (coach_id);
CREATE INDEX idx_supplement_intake_client ON public.supplement_intake USING btree (client_id);
CREATE INDEX idx_supplement_intake_client_date ON public.supplement_intake USING btree (client_id, date);
CREATE INDEX idx_supplement_intake_protocol ON public.supplement_intake USING btree (protocol_id);
CREATE UNIQUE INDEX idx_supplement_intake_unique ON public.supplement_intake USING btree (client_id, protocol_id, date);
CREATE INDEX idx_supplement_library_active ON public.supplement_library USING btree (is_active);
CREATE INDEX idx_supplement_library_category ON public.supplement_library USING btree (category);
CREATE INDEX idx_supplement_library_coach ON public.supplement_library USING btree (coach_id);
CREATE INDEX idx_weight_proofs_client_date ON public.weight_proofs USING btree (client_id, proof_date DESC);
CREATE INDEX idx_weight_proofs_coach_date ON public.weight_proofs USING btree (coach_id, proof_date DESC);
CREATE INDEX idx_workout_logs_client ON public.workout_logs USING btree (client_id);
CREATE INDEX idx_workout_logs_coach ON public.workout_logs USING btree (coach_id);
CREATE INDEX idx_workout_logs_date ON public.workout_logs USING btree (client_id, workout_date DESC);
CREATE INDEX idx_workout_programs_club ON public.workout_programs USING btree (coach_id, is_club_workout) WHERE (is_club_workout = true);

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.check_workout_log_constraints()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object(
    'workout_logs_client_date_unique', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_client_date_unique'
    ),
    'exercise_logs_workout_exercise_unique', EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'exercise_logs_workout_exercise_unique'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.enable_gym_features_for_email(target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NOT NULL THEN
        INSERT INTO coach_settings (coach_id, gym_features_enabled)
        VALUES (target_user_id, true)
        ON CONFLICT (coach_id)
        DO UPDATE SET gym_features_enabled = true, updated_at = NOW();
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_coach_branding()
 RETURNS TABLE(id uuid, name text, subscription_tier text, brand_name text, brand_logo_url text, brand_favicon_url text, brand_primary_color text, brand_secondary_color text, brand_accent_color text, brand_email_logo_url text, brand_email_footer text, branding_updated_at timestamp with time zone, profile_photo_url text, brand_bg_color text, brand_bg_secondary_color text, brand_card_color text, brand_text_color text, brand_text_secondary_color text, brand_font text, brand_button_style text, brand_welcome_message text, brand_app_name text, brand_short_name text, client_modules jsonb, custom_terminology jsonb, use_default_tutorial_video boolean, custom_tutorial_video_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    c.use_default_tutorial_video,
    c.custom_tutorial_video_url
  FROM public.clients cl
  JOIN public.coaches c ON c.id = cl.coach_id
  WHERE cl.user_id = auth.uid()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_checkin_due_date(p_client_id integer)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    reminder RECORD;
    last_checkin DATE;
    next_due DATE;
BEGIN
    SELECT * INTO reminder FROM public.checkin_reminders 
    WHERE client_id = p_client_id AND is_active = true LIMIT 1;
    
    IF NOT FOUND THEN RETURN NULL; END IF;
    
    SELECT DATE(created_at) INTO last_checkin FROM public.client_checkins 
    WHERE client_id = p_client_id ORDER BY created_at DESC LIMIT 1;
    
    IF last_checkin IS NULL THEN
        RETURN CURRENT_DATE;
    END IF;
    
    next_due := last_checkin + reminder.frequency_days;
    RETURN next_due;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_clients_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_diary_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_gym_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_recipes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_supplement_library_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- VIEWS
CREATE OR REPLACE VIEW public.exercise_history AS  SELECT el.id,
    el.exercise_id,
    el.exercise_name,
    el.sets_data,
    el.total_sets,
    el.total_reps,
    el.total_volume,
    el.max_weight,
    el.is_pr,
    wl.workout_date,
    wl.client_id,
    wl.coach_id
   FROM (exercise_logs el
     JOIN workout_logs wl ON ((el.workout_log_id = wl.id)))
  ORDER BY wl.workout_date DESC;

-- TRIGGERS
CREATE TRIGGER calorie_goals_updated_at BEFORE UPDATE ON public.calorie_goals FOR EACH ROW EXECUTE FUNCTION update_diary_updated_at();
CREATE TRIGGER update_checkin_reminder_settings_updated_at BEFORE UPDATE ON public.checkin_reminder_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_reminder_preferences_updated_at BEFORE UPDATE ON public.client_reminder_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assignments_timestamp BEFORE UPDATE ON public.client_workout_assignments FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_clients_updated_at();
CREATE TRIGGER update_club_workouts_timestamp BEFORE UPDATE ON public.club_workouts FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
CREATE TRIGGER update_coach_meal_plans_updated_at BEFORE UPDATE ON public.coach_meal_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coach_settings_timestamp BEFORE UPDATE ON public.coach_settings FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
CREATE TRIGGER diary_comments_updated_at BEFORE UPDATE ON public.diary_entry_comments FOR EACH ROW EXECUTE FUNCTION update_diary_updated_at();
CREATE TRIGGER update_exercises_timestamp BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
CREATE TRIGGER food_diary_entries_updated_at BEFORE UPDATE ON public.food_diary_entries FOR EACH ROW EXECUTE FUNCTION update_diary_updated_at();
CREATE TRIGGER recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION update_recipes_updated_at();
CREATE TRIGGER supplement_library_updated_at BEFORE UPDATE ON public.supplement_library FOR EACH ROW EXECUTE FUNCTION update_supplement_library_updated_at();
CREATE TRIGGER update_workout_logs_timestamp BEFORE UPDATE ON public.workout_logs FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
CREATE TRIGGER update_workout_programs_timestamp BEFORE UPDATE ON public.workout_programs FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

-- ROW LEVEL SECURITY
ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_message_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plateau_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calorie_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_adhoc_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_exercise_personal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reminder_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_command_center_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_exercise_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_entry_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_entry_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dismissed_activity_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_account_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pep_talk_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pep_talk_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pep_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_custom_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Clients can view reactions on own items" ON public.activity_reactions AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage own activity reactions" ON public.activity_reactions AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "coach manages own drafts" ON public.ai_message_drafts AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM coaches c
  WHERE ((c.id = ai_message_drafts.coach_id) AND (c.id = auth.uid())))));
CREATE POLICY "coach manages own plateau acks" ON public.ai_plateau_acknowledgements AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM coaches c
  WHERE ((c.id = ai_plateau_acknowledgements.coach_id) AND (c.id = auth.uid())))));
CREATE POLICY audit_log_insert_own ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((actor_id = auth.uid()));
CREATE POLICY audit_log_select_own ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (((actor_id = auth.uid()) OR (tenant_id = auth.uid())));
CREATE POLICY "Clients can insert own calorie goals" ON public.calorie_goals AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can update own calorie goals" ON public.calorie_goals AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own calorie goals" ON public.calorie_goals AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client calorie goals" ON public.calorie_goals AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view own participation" ON public.challenge_participants AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage participants for own challenges" ON public.challenge_participants AS PERMISSIVE FOR ALL TO public USING ((challenge_id IN ( SELECT coach_challenges.id
   FROM coach_challenges
  WHERE (coach_challenges.coach_id = auth.uid()))));
CREATE POLICY "Clients can manage own progress" ON public.challenge_progress AS PERMISSIVE FOR ALL TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view progress for own challenges" ON public.challenge_progress AS PERMISSIVE FOR SELECT TO public USING ((challenge_id IN ( SELECT coach_challenges.id
   FROM coach_challenges
  WHERE (coach_challenges.coach_id = auth.uid()))));
CREATE POLICY "Clients can send chat messages" ON public.chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((sender_type)::text = 'client'::text) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid())))));
CREATE POLICY "Clients can update own chat messages" ON public.chat_messages AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own chat messages" ON public.chat_messages AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can delete own sent messages" ON public.chat_messages AS PERMISSIVE FOR DELETE TO public USING (((coach_id = auth.uid()) AND ((sender_type)::text = 'coach'::text)));
CREATE POLICY "Coaches can send chat messages" ON public.chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (((coach_id = auth.uid()) AND ((sender_type)::text = 'coach'::text)));
CREATE POLICY "Coaches can update own chat messages" ON public.chat_messages AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own chat messages" ON public.chat_messages AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert reminder logs" ON public.checkin_reminder_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view reminder logs" ON public.checkin_reminder_log AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can manage own reminder settings" ON public.checkin_reminder_settings AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Service role full access" ON public.client_adhoc_workouts AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Clients can insert own checkins" ON public.client_checkins AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can update own checkins" ON public.client_checkins AS PERMISSIVE FOR UPDATE TO public USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))) AND (coach_responded_at IS NULL)));
CREATE POLICY "Clients can view own checkins" ON public.client_checkins AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client checkins" ON public.client_checkins AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients manage own personal exercise notes" ON public.client_exercise_personal_notes AS PERMISSIVE FOR ALL TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid())))) WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own measurements" ON public.client_measurements AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own measurements" ON public.client_measurements AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage their clients measurements" ON public.client_measurements AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view their own payments" ON public.client_payments AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view their clients payments" ON public.client_payments AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view own protocols" ON public.client_protocols AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can delete own client protocols" ON public.client_protocols AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can insert own client protocols" ON public.client_protocols AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own client protocols" ON public.client_protocols AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own client protocols" ON public.client_protocols AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Clients can update own reminder preferences" ON public.client_reminder_preferences AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own reminder preferences" ON public.client_reminder_preferences AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client reminder preferences" ON public.client_reminder_preferences AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view their own subscriptions" ON public.client_subscriptions AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view their clients subscriptions" ON public.client_subscriptions AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view own assignments" ON public.client_workout_assignments AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client assignments" ON public.client_workout_assignments AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view their own profile" ON public.clients AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Coaches can delete own clients" ON public.clients AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can insert own clients" ON public.clients AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own clients" ON public.clients AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own clients" ON public.clients AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Clients can view coach club workouts" ON public.club_workouts AS PERMISSIVE FOR SELECT TO public USING ((coach_id IN ( SELECT clients.coach_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage own club workouts" ON public.club_workouts AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Service role full access club workouts" ON public.club_workouts AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Clients can view challenges they participate in" ON public.coach_challenges AS PERMISSIVE FOR SELECT TO public USING ((id IN ( SELECT challenge_participants.challenge_id
   FROM challenge_participants
  WHERE (challenge_participants.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.user_id = auth.uid()))))));
CREATE POLICY "Coaches can manage own challenges" ON public.coach_challenges AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "coach manages own pins" ON public.coach_command_center_pins AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM coaches c
  WHERE ((c.id = coach_command_center_pins.coach_id) AND (c.id = auth.uid())))));
CREATE POLICY "coach can read own briefings" ON public.coach_daily_briefings AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM coaches c
  WHERE ((c.id = coach_daily_briefings.coach_id) AND (c.id = auth.uid())))));
CREATE POLICY "Coaches can delete own exercise references" ON public.coach_exercise_references AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert own exercise references" ON public.coach_exercise_references AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own exercise references" ON public.coach_exercise_references AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own exercise references" ON public.coach_exercise_references AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Service role full access to exercise references" ON public.coach_exercise_references AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Clients can view their own meal plans" ON public.coach_meal_plans AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can delete own plans" ON public.coach_meal_plans AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can insert own plans" ON public.coach_meal_plans AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own plans" ON public.coach_meal_plans AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own plans" ON public.coach_meal_plans AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Anyone can view active plans" ON public.coach_payment_plans AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY "Coaches can manage their own plans" ON public.coach_payment_plans AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can manage their own promo codes" ON public.coach_promo_codes AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert own settings" ON public.coach_settings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own settings" ON public.coach_settings AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own settings" ON public.coach_settings AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can manage their own stories" ON public.coach_stories AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Service role can access all stories" ON public.coach_stories AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role full access" ON public.coach_story_highlights AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Clients can view their coach" ON public.coaches AS PERMISSIVE FOR SELECT TO authenticated USING ((id IN ( SELECT clients.coach_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can update own data" ON public.coaches AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "Coaches can view own data" ON public.coaches AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Users can create their own coach record" ON public.coaches AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY anon_insert_signup ON public.coaches AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY authenticated_insert_signup ON public.coaches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY authenticated_select_own ON public.coaches AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY authenticated_update_own ON public.coaches AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "Allow anonymous inserts" ON public.contact_submissions AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow authenticated reads" ON public.contact_submissions AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Clients can add reply comments" ON public.diary_entry_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((author_type)::text = 'client'::text) AND (client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid())))));
CREATE POLICY "Clients can view comments on own entries" ON public.diary_entry_comments AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage own comments" ON public.diary_entry_comments AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view reactions on own entries" ON public.diary_entry_reactions AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage reactions on client entries" ON public.diary_entry_reactions AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can delete own dismissals" ON public.dismissed_activity_items AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can insert own dismissals" ON public.dismissed_activity_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own dismissals" ON public.dismissed_activity_items AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own dismissals" ON public.dismissed_activity_items AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Users can manage exercise logs via workout" ON public.exercise_logs AS PERMISSIVE FOR ALL TO public USING ((workout_log_id IN ( SELECT workout_logs.id
   FROM workout_logs
  WHERE ((workout_logs.coach_id = auth.uid()) OR (workout_logs.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.user_id = auth.uid())))))));
CREATE POLICY "Allow public insert on exercises" ON public.exercises AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update on exercises" ON public.exercises AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can view global exercises" ON public.exercises AS PERMISSIVE FOR SELECT TO public USING (((coach_id IS NULL) OR (coach_id = auth.uid())));
CREATE POLICY "Coaches can create custom exercises" ON public.exercises AS PERMISSIVE FOR INSERT TO public WITH CHECK (((coach_id = auth.uid()) AND (is_custom = true)));
CREATE POLICY "Coaches can delete own exercises" ON public.exercises AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own exercises" ON public.exercises AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can delete own diary entries" ON public.food_diary_entries AS PERMISSIVE FOR DELETE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own diary entries" ON public.food_diary_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can update own diary entries" ON public.food_diary_entries AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own diary entries" ON public.food_diary_entries AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client diary entries" ON public.food_diary_entries AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view client diary entries" ON public.food_diary_entries AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Anyone can submit form responses" ON public.form_responses AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Coaches can read their form responses" ON public.form_responses AS PERMISSIVE FOR SELECT TO public USING ((form_template_id IN ( SELECT form_templates.id
   FROM form_templates
  WHERE (form_templates.coach_id = auth.uid()))));
CREATE POLICY "Coaches can update their form responses" ON public.form_responses AS PERMISSIVE FOR UPDATE TO public USING ((form_template_id IN ( SELECT form_templates.id
   FROM form_templates
  WHERE (form_templates.coach_id = auth.uid()))));
CREATE POLICY "Anyone can read active form templates" ON public.form_templates AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY "Coaches can manage their own form templates" ON public.form_templates AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid())) WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Clients can insert own gym proofs" ON public.gym_proofs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own gym proofs" ON public.gym_proofs AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client gym proofs" ON public.gym_proofs AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "master account can read audit" ON public.master_account_audit AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth.users u
  WHERE ((u.id = auth.uid()) AND ((u.email)::text = 'contact@ziquefitness.com'::text)))));
CREATE POLICY "Clients can delete own favorites" ON public.meal_favorites AS PERMISSIVE FOR DELETE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own favorites" ON public.meal_favorites AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own favorites" ON public.meal_favorites AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client favorites" ON public.meal_favorites AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Allow public read access" ON public.meal_images AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow service role insert" ON public.meal_images AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Coaches can delete own templates" ON public.meal_plan_templates AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert own templates" ON public.meal_plan_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own templates" ON public.meal_plan_templates AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own templates" ON public.meal_plan_templates AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Anyone can view meal plans with token" ON public.meal_plans AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Coaches can create meal plans" ON public.meal_plans AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can delete own meal plans" ON public.meal_plans AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own meal plans" ON public.meal_plans AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own meal plans" ON public.meal_plans AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "auth users can insert delivery confirmations" ON public.notification_delivery_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "users can read confirmations of their notifications" ON public.notification_delivery_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_delivery_log.notification_id) AND ((n.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM (clients cl
             JOIN coaches co ON ((co.id = cl.coach_id)))
          WHERE ((cl.id = n.related_client_id) AND (co.id = auth.uid())))))))));
CREATE POLICY "Clients can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Coaches can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Clients can view own pep talk recipients" ON public.pep_talk_recipients AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches manage own pep talk recipients" ON public.pep_talk_recipients AS PERMISSIVE FOR ALL TO public USING ((pep_talk_id IN ( SELECT pep_talks.id
   FROM pep_talks
  WHERE (pep_talks.coach_id = auth.uid())))) WITH CHECK ((pep_talk_id IN ( SELECT pep_talks.id
   FROM pep_talks
  WHERE (pep_talks.coach_id = auth.uid()))));
CREATE POLICY "Clients can insert own pep talk views" ON public.pep_talk_views AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can update own pep talk views" ON public.pep_talk_views AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own pep talk views" ON public.pep_talk_views AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view pep talk views" ON public.pep_talk_views AS PERMISSIVE FOR SELECT TO public USING ((pep_talk_id IN ( SELECT pep_talks.id
   FROM pep_talks
  WHERE (pep_talks.coach_id = auth.uid()))));
CREATE POLICY "Clients can view targeted pep talks" ON public.pep_talks AS PERMISSIVE FOR SELECT TO public USING (((archived = false) AND ((((recipient_type)::text = 'all'::text) AND (coach_id IN ( SELECT clients.coach_id
   FROM clients
  WHERE (clients.user_id = auth.uid())))) OR (id IN ( SELECT pt.pep_talk_id
   FROM pep_talk_recipients pt
  WHERE (pt.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.user_id = auth.uid()))))))));
CREATE POLICY "Coaches can create pep talks" ON public.pep_talks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can delete own pep talks" ON public.pep_talks AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own pep talks" ON public.pep_talks AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own pep talks" ON public.pep_talks AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view own PRs" ON public.personal_records AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view client PRs" ON public.personal_records AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.coach_id = auth.uid()))));
CREATE POLICY "Service can manage PRs" ON public.personal_records AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "Clients can view own photos" ON public.progress_photos AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage their clients photos" ON public.progress_photos AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can create recipe requests" ON public.recipe_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own recipe requests" ON public.recipe_requests AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can update recipe requests" ON public.recipe_requests AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view client recipe requests" ON public.recipe_requests AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can view coach public recipes" ON public.recipes AS PERMISSIVE FOR SELECT TO public USING (((is_public = true) AND ((coach_id IS NULL) OR (coach_id IN ( SELECT clients.coach_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))))));
CREATE POLICY "Coaches can delete own recipes" ON public.recipes AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert own recipes" ON public.recipes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own recipes" ON public.recipes AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own and public recipes" ON public.recipes AS PERMISSIVE FOR SELECT TO public USING (((coach_id = auth.uid()) OR ((coach_id IS NULL) AND (is_public = true))));
CREATE POLICY "Clients can delete own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR DELETE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can delete own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR DELETE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can insert own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR INSERT TO public WITH CHECK ((coach_id = auth.uid()));
CREATE POLICY "Coaches can update own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR UPDATE TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can view own saved meals" ON public.saved_custom_meals AS PERMISSIVE FOR SELECT TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Anyone can insert" ON public.shared_meal_plans AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public access" ON public.shared_meal_plans AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can update shared workout programs" ON public.shared_workout_programs AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Authenticated users can create shared workout programs" ON public.shared_workout_programs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public read access for shared workout programs" ON public.shared_workout_programs AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Service role full access" ON public.story_reactions AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role full access" ON public.story_replies AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role full access" ON public.story_views AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Coaches can view own subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Users can create their own subscription" ON public.subscriptions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Clients can delete own supplement intake" ON public.supplement_intake AS PERMISSIVE FOR DELETE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own supplement intake" ON public.supplement_intake AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own supplement intake" ON public.supplement_intake AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can view client supplement intake" ON public.supplement_intake AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.coach_id = auth.uid()))));
CREATE POLICY "Coaches can delete own supplements" ON public.supplement_library AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can insert own supplements" ON public.supplement_library AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = coach_id));
CREATE POLICY "Coaches can update own supplements" ON public.supplement_library AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Coaches can view own supplement library" ON public.supplement_library AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = coach_id));
CREATE POLICY "Clients can manage their own water intake" ON public.water_intake AS PERMISSIVE FOR ALL TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can insert own weight proofs" ON public.weight_proofs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own weight proofs" ON public.weight_proofs AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client weight proofs" ON public.weight_proofs AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Clients can insert own workout logs" ON public.workout_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can update own workout logs" ON public.workout_logs AS PERMISSIVE FOR UPDATE TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Clients can view own workout logs" ON public.workout_logs AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));
CREATE POLICY "Coaches can manage client workout logs" ON public.workout_logs AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
CREATE POLICY "Coaches can manage own programs" ON public.workout_programs AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));
