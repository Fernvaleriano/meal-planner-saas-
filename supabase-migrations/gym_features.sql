-- Migration: Gym/Workout Features
-- Adds exercise library, workout programs, and workout logging capabilities
-- Feature flag: Only visible to coaches with gym_features_enabled = true

-- ==============================================
-- FEATURE FLAG: Add gym_features_enabled to coaches
-- ==============================================

-- Create a coach_settings table for feature flags
CREATE TABLE IF NOT EXISTS coach_settings (
    id SERIAL PRIMARY KEY,
    coach_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_features_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE coach_settings ENABLE ROW LEVEL SECURITY;

-- Coaches can view and update their own settings
CREATE POLICY "Coaches can view own settings" ON coach_settings
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can update own settings" ON coach_settings
    FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own settings" ON coach_settings
    FOR INSERT WITH CHECK (coach_id = auth.uid());

-- ==============================================
-- EXERCISE LIBRARY
-- ==============================================

CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,

    -- Categorization
    muscle_group VARCHAR(100), -- Primary: chest, back, shoulders, legs, arms, core
    secondary_muscles JSONB DEFAULT '[]'::jsonb, -- Array of secondary muscles worked
    equipment VARCHAR(100), -- barbell, dumbbell, cable, machine, bodyweight, etc.
    exercise_type VARCHAR(50), -- strength, cardio, flexibility, plyometric
    difficulty VARCHAR(20), -- beginner, intermediate, advanced

    -- Media
    animation_url TEXT, -- URL to exercise animation/video
    thumbnail_url TEXT, -- URL to thumbnail image

    -- Metadata
    calories_per_minute DECIMAL(5,2), -- Estimated calories burned
    is_compound BOOLEAN DEFAULT false, -- Compound vs isolation
    is_unilateral BOOLEAN DEFAULT false, -- Single arm/leg exercises

    -- Custom exercises by coach
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global exercise
    is_custom BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for exercise search/filter
CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
CREATE INDEX IF NOT EXISTS idx_exercises_type ON exercises(exercise_type);
CREATE INDEX IF NOT EXISTS idx_exercises_coach ON exercises(coach_id);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);

-- Enable RLS
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Everyone can view global exercises, coaches can view their custom exercises
CREATE POLICY "Anyone can view global exercises" ON exercises
    FOR SELECT USING (coach_id IS NULL OR coach_id = auth.uid());

-- Coaches can create custom exercises
CREATE POLICY "Coaches can create custom exercises" ON exercises
    FOR INSERT WITH CHECK (coach_id = auth.uid() AND is_custom = true);

-- Coaches can update their custom exercises
CREATE POLICY "Coaches can update own exercises" ON exercises
    FOR UPDATE USING (coach_id = auth.uid());

-- Coaches can delete their custom exercises
CREATE POLICY "Coaches can delete own exercises" ON exercises
    FOR DELETE USING (coach_id = auth.uid());

-- ==============================================
-- WORKOUT PROGRAMS (Templates created by coaches)
-- ==============================================

CREATE TABLE IF NOT EXISTS workout_programs (
    id SERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Program details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    program_type VARCHAR(50), -- strength, hypertrophy, endurance, weight_loss, general
    difficulty VARCHAR(20), -- beginner, intermediate, advanced
    duration_weeks INTEGER, -- Program length
    days_per_week INTEGER, -- Recommended frequency

    -- Program structure stored as JSONB for flexibility
    -- Format: { "weeks": [{ "weekNumber": 1, "workouts": [...] }] }
    program_data JSONB DEFAULT '{}'::jsonb,

    -- Status
    is_template BOOLEAN DEFAULT true, -- Can be reused
    is_published BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_programs_coach ON workout_programs(coach_id);
CREATE INDEX IF NOT EXISTS idx_programs_type ON workout_programs(program_type);

-- Enable RLS
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own programs
CREATE POLICY "Coaches can manage own programs" ON workout_programs
    FOR ALL USING (coach_id = auth.uid());

-- ==============================================
-- CLIENT ASSIGNED WORKOUTS
-- ==============================================

CREATE TABLE IF NOT EXISTS client_workout_assignments (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id INTEGER REFERENCES workout_programs(id) ON DELETE SET NULL,

    -- Assignment details
    name VARCHAR(255) NOT NULL, -- Can override program name
    start_date DATE,
    end_date DATE,

    -- The actual workout plan (copied/customized from program)
    workout_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_client ON client_workout_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_assignments_coach ON client_workout_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON client_workout_assignments(client_id, is_active);

-- Enable RLS
ALTER TABLE client_workout_assignments ENABLE ROW LEVEL SECURITY;

-- Coaches can manage assignments for their clients
CREATE POLICY "Coaches can manage client assignments" ON client_workout_assignments
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view their own assignments
CREATE POLICY "Clients can view own assignments" ON client_workout_assignments
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==============================================
-- WORKOUT LOGS (Client's actual workout records)
-- ==============================================

CREATE TABLE IF NOT EXISTS workout_logs (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES client_workout_assignments(id) ON DELETE SET NULL,

    -- Workout session details
    workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
    workout_name VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER, -- Total workout duration

    -- Summary stats
    total_volume DECIMAL(10,2), -- Total weight lifted (sets * reps * weight)
    total_sets INTEGER,
    total_reps INTEGER,
    estimated_calories INTEGER,

    -- Notes
    notes TEXT,
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
    soreness_level INTEGER CHECK (soreness_level >= 1 AND soreness_level <= 3),
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 3),
    workout_rating INTEGER CHECK (workout_rating >= 1 AND workout_rating <= 5),

    -- Status
    status VARCHAR(20) DEFAULT 'completed', -- in_progress, completed, skipped

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_logs_client ON workout_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(client_id, workout_date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_logs_coach ON workout_logs(coach_id);

-- Enable RLS
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- Coaches can manage workout logs for their clients
CREATE POLICY "Coaches can manage client workout logs" ON workout_logs
    FOR ALL USING (coach_id = auth.uid());

-- Clients can manage their own workout logs
CREATE POLICY "Clients can view own workout logs" ON workout_logs
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can insert own workout logs" ON workout_logs
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can update own workout logs" ON workout_logs
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==============================================
-- EXERCISE LOGS (Individual exercise sets within a workout)
-- ==============================================

CREATE TABLE IF NOT EXISTS exercise_logs (
    id SERIAL PRIMARY KEY,
    workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,

    -- Exercise details (denormalized for history)
    exercise_name VARCHAR(255) NOT NULL,
    exercise_order INTEGER, -- Order within workout

    -- Set data stored as JSONB array
    -- Format: [{ "setNumber": 1, "reps": 10, "weight": 135, "weightUnit": "lbs", "rpe": 8, "restSeconds": 90, "notes": "" }]
    sets_data JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Aggregates (computed from sets_data)
    total_sets INTEGER,
    total_reps INTEGER,
    total_volume DECIMAL(10,2), -- sum of (reps * weight) for all sets
    max_weight DECIMAL(8,2),

    -- Notes
    notes TEXT,
    is_pr BOOLEAN DEFAULT false, -- Personal record flag

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exercise_logs_workout ON exercise_logs(workout_log_id);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_exercise ON exercise_logs(exercise_id);

-- Enable RLS
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;

-- Exercise logs inherit permissions from parent workout_log
CREATE POLICY "Users can manage exercise logs via workout" ON exercise_logs
    FOR ALL USING (
        workout_log_id IN (
            SELECT id FROM workout_logs
            WHERE coach_id = auth.uid()
            OR client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
        )
    );

-- ==============================================
-- EXERCISE HISTORY VIEW (For progress tracking)
-- ==============================================

CREATE OR REPLACE VIEW exercise_history
WITH (security_invoker = true)
AS
SELECT
    el.id,
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
FROM exercise_logs el
JOIN workout_logs wl ON el.workout_log_id = wl.id
ORDER BY wl.workout_date DESC;

-- ==============================================
-- PERSONAL RECORDS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS personal_records (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
    exercise_name VARCHAR(255) NOT NULL,

    -- Record types
    record_type VARCHAR(20) NOT NULL, -- max_weight, max_reps, max_volume
    record_value DECIMAL(10,2) NOT NULL,
    weight_unit VARCHAR(10) DEFAULT 'lbs',

    -- When/where it was set
    achieved_date DATE NOT NULL,
    workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE SET NULL,

    -- Previous record (for comparison)
    previous_value DECIMAL(10,2),
    previous_date DATE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pr_client ON personal_records(client_id);
CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(client_id, exercise_id);

-- Enable RLS
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

-- Coaches can view PRs for their clients
CREATE POLICY "Coaches can view client PRs" ON personal_records
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE coach_id = auth.uid())
    );

-- Clients can view their own PRs
CREATE POLICY "Clients can view own PRs" ON personal_records
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- System inserts PRs (via service role)
CREATE POLICY "Service can manage PRs" ON personal_records
    FOR ALL USING (true);

-- ==============================================
-- TRIGGER: Update updated_at timestamps
-- ==============================================

CREATE OR REPLACE FUNCTION update_gym_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply to all gym tables with updated_at
CREATE TRIGGER update_coach_settings_timestamp
    BEFORE UPDATE ON coach_settings
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_exercises_timestamp
    BEFORE UPDATE ON exercises
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_workout_programs_timestamp
    BEFORE UPDATE ON workout_programs
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_assignments_timestamp
    BEFORE UPDATE ON client_workout_assignments
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_workout_logs_timestamp
    BEFORE UPDATE ON workout_logs
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

-- ==============================================
-- ENABLE GYM FEATURES FOR FERNANDO (contact@ziquefitness.com)
-- ==============================================

-- This will be run after the coach logs in and their user ID is known
-- For now, we'll create a function to enable gym features by email

CREATE OR REPLACE FUNCTION enable_gym_features_for_email(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID from auth.users by email
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NOT NULL THEN
        -- Insert or update coach_settings
        INSERT INTO coach_settings (coach_id, gym_features_enabled)
        VALUES (target_user_id, true)
        ON CONFLICT (coach_id)
        DO UPDATE SET gym_features_enabled = true, updated_at = NOW();
    END IF;
END;
$$;

-- Run this to enable for Fernando:
-- SELECT enable_gym_features_for_email('contact@ziquefitness.com');
