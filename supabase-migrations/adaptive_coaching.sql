-- Migration: Adaptive Fitness Coaching System
-- Adds readiness scoring, RPE auto-regulation, gamification, contextual nutrition,
-- and coach triage features for a dynamic, hyper-personalized coaching experience.

-- ==============================================
-- DAILY READINESS ASSESSMENTS
-- Tracks sleep, stress, soreness, mood to compute readiness scores
-- ==============================================

CREATE TABLE IF NOT EXISTS daily_readiness (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Date of assessment
    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Sleep metrics (1-10 scale)
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
    sleep_hours DECIMAL(3,1), -- e.g. 7.5

    -- Stress & recovery (1-10 scale)
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
    muscle_soreness INTEGER CHECK (muscle_soreness >= 1 AND muscle_soreness <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    mood INTEGER CHECK (mood >= 1 AND mood <= 10),

    -- Optional HRV / resting HR if user has wearable
    resting_heart_rate INTEGER,
    hrv_score INTEGER,

    -- Computed readiness score (0-100)
    readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100),

    -- AI recommendation based on readiness
    intensity_recommendation VARCHAR(20), -- 'deload', 'easy', 'moderate', 'hard', 'peak'
    ai_recommendation TEXT, -- Full AI coaching note

    -- Preferred peak day (user preference)
    preferred_peak_day INTEGER CHECK (preferred_peak_day >= 0 AND preferred_peak_day <= 6), -- 0=Sun, 6=Sat

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint: one readiness per client per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_client_date ON daily_readiness(client_id, assessment_date);
CREATE INDEX IF NOT EXISTS idx_readiness_coach ON daily_readiness(coach_id);
CREATE INDEX IF NOT EXISTS idx_readiness_score ON daily_readiness(client_id, readiness_score);

ALTER TABLE daily_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage client readiness" ON daily_readiness
    FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Clients can view own readiness" ON daily_readiness
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can insert own readiness" ON daily_readiness
    FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can update own readiness" ON daily_readiness
    FOR UPDATE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ==============================================
-- RPE (Rate of Perceived Exertion) SET TRACKING
-- Extends exercise_logs with per-set RPE for auto-regulation
-- ==============================================

-- Add RPE fields to exercise_logs if not present
-- The sets_data JSONB already supports rpe per set, but we add aggregate columns
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS avg_rpe DECIMAL(3,1);
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS target_rpe DECIMAL(3,1);
ALTER TABLE exercise_logs ADD COLUMN IF NOT EXISTS rpe_adjustment TEXT; -- AI suggestion for next set

-- Add readiness_score to workout_logs for correlation
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS readiness_score INTEGER;
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS intensity_modifier DECIMAL(3,2) DEFAULT 1.0; -- 0.5 = deload, 1.0 = normal, 1.2 = peak

-- ==============================================
-- WEIGHT RECOMMENDATIONS (Auto-regulation engine)
-- Stores AI-computed weight recommendations based on RPE history
-- ==============================================

CREATE TABLE IF NOT EXISTS weight_recommendations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    exercise_name VARCHAR(255) NOT NULL,

    -- Current recommendation
    recommended_weight DECIMAL(8,2),
    weight_unit VARCHAR(10) DEFAULT 'lbs',
    recommended_reps INTEGER,
    target_rpe DECIMAL(3,1) DEFAULT 7.5,

    -- Basis for recommendation
    last_weight DECIMAL(8,2),
    last_reps INTEGER,
    last_rpe DECIMAL(3,1),
    trend VARCHAR(20), -- 'increasing', 'stable', 'decreasing', 'new'

    -- Readiness adjustment
    readiness_adjusted BOOLEAN DEFAULT false,
    base_weight DECIMAL(8,2), -- Weight before readiness adjustment
    adjustment_reason TEXT,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_rec_client_exercise ON weight_recommendations(client_id, exercise_name);
CREATE INDEX IF NOT EXISTS idx_weight_rec_client ON weight_recommendations(client_id);

ALTER TABLE weight_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own weight recs" ON weight_recommendations
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage weight recs" ON weight_recommendations
    FOR ALL USING (true);

-- ==============================================
-- GAMIFICATION: BADGES & ACHIEVEMENTS
-- ==============================================

CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- emoji or icon identifier
    category VARCHAR(50) NOT NULL, -- 'performance', 'consistency', 'nutrition', 'recovery', 'milestone'
    requirement_type VARCHAR(50) NOT NULL, -- 'pr_count', 'streak_days', 'workouts_completed', 'readiness_avg', etc.
    requirement_value INTEGER NOT NULL, -- threshold to earn
    tier VARCHAR(20) DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum'
    points INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default badges
INSERT INTO badges (name, description, icon, category, requirement_type, requirement_value, tier, points) VALUES
    ('First Blood', 'Complete your first workout', '💪', 'milestone', 'workouts_completed', 1, 'bronze', 10),
    ('Iron Will', 'Complete 10 workouts', '🏋️', 'milestone', 'workouts_completed', 10, 'silver', 25),
    ('Century Club', 'Complete 100 workouts', '💯', 'milestone', 'workouts_completed', 100, 'gold', 100),
    ('Peak Performance', 'Hit a new personal record', '🏆', 'performance', 'pr_count', 1, 'bronze', 15),
    ('Record Breaker', 'Hit 10 personal records', '🔥', 'performance', 'pr_count', 10, 'silver', 50),
    ('Unstoppable', 'Hit 50 personal records', '⚡', 'performance', 'pr_count', 50, 'gold', 150),
    ('Consistency King', '7-day workout streak', '👑', 'consistency', 'streak_days', 7, 'bronze', 20),
    ('Iron Habit', '30-day workout streak', '🔗', 'consistency', 'streak_days', 30, 'silver', 75),
    ('Unbreakable', '90-day workout streak', '💎', 'consistency', 'streak_days', 90, 'gold', 200),
    ('Biohacker', 'Log readiness for 7 consecutive days', '🧬', 'recovery', 'readiness_streak', 7, 'bronze', 20),
    ('Recovery Master', 'Maintain avg readiness above 75 for 30 days', '🧘', 'recovery', 'readiness_avg', 75, 'silver', 60),
    ('Nutrition Pro', 'Log meals for 7 consecutive days', '🥗', 'nutrition', 'nutrition_streak', 7, 'bronze', 20),
    ('Meal Prep Master', 'Log meals for 30 consecutive days', '🍳', 'nutrition', 'nutrition_streak', 30, 'silver', 75),
    ('RPE Scholar', 'Rate RPE on 50 sets', '📊', 'performance', 'rpe_count', 50, 'bronze', 15),
    ('Auto-Regulated', 'Rate RPE on 200 sets', '🎯', 'performance', 'rpe_count', 200, 'silver', 40)
ON CONFLICT DO NOTHING;

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badges" ON badges
    FOR SELECT USING (true);

-- ==============================================
-- CLIENT EARNED BADGES
-- ==============================================

CREATE TABLE IF NOT EXISTS client_badges (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    context JSONB DEFAULT '{}'::jsonb -- e.g. {"exercise": "Bench Press", "weight": 225}
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_badge_unique ON client_badges(client_id, badge_id);
CREATE INDEX IF NOT EXISTS idx_client_badges ON client_badges(client_id);

ALTER TABLE client_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own badges" ON client_badges
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage client badges" ON client_badges
    FOR ALL USING (true);

-- ==============================================
-- HEALTH SPAN SCORE (Composite wellness metric)
-- ==============================================

CREATE TABLE IF NOT EXISTS health_span_scores (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    score_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Component scores (0-100 each)
    training_score INTEGER DEFAULT 0,      -- workout consistency & progression
    nutrition_score INTEGER DEFAULT 0,     -- meal adherence & balance
    recovery_score INTEGER DEFAULT 0,      -- sleep, stress, readiness
    consistency_score INTEGER DEFAULT 0,   -- streak & habit tracking

    -- Composite Health Span score (0-100, weighted average)
    health_span_score INTEGER DEFAULT 0,

    -- Trend data
    score_change INTEGER DEFAULT 0, -- compared to previous day
    rolling_7d_avg DECIMAL(5,1),
    rolling_30d_avg DECIMAL(5,1),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_span_client_date ON health_span_scores(client_id, score_date);
CREATE INDEX IF NOT EXISTS idx_health_span_client ON health_span_scores(client_id);

ALTER TABLE health_span_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own health span" ON health_span_scores
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage health span" ON health_span_scores
    FOR ALL USING (true);

-- ==============================================
-- WORKOUT INTENSITY SCHEDULE
-- AI-planned weekly intensity based on readiness and preferences
-- ==============================================

CREATE TABLE IF NOT EXISTS workout_intensity_schedule (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Schedule for the week
    week_start_date DATE NOT NULL,
    schedule_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Format: [{"day": 0, "intensity": "rest", "focus": ""},
    --          {"day": 1, "intensity": "moderate", "focus": "upper"},
    --          {"day": 5, "intensity": "peak", "focus": "legs"}, ...]

    -- Adaptation triggers
    was_auto_adjusted BOOLEAN DEFAULT false,
    adjustment_reason TEXT,
    original_schedule JSONB, -- stored before auto-adjustment

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intensity_schedule_client_week ON workout_intensity_schedule(client_id, week_start_date);

ALTER TABLE workout_intensity_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own schedule" ON workout_intensity_schedule
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage schedules" ON workout_intensity_schedule
    FOR ALL USING (true);

-- ==============================================
-- COACH TRIAGE FLAGS
-- AI-detected struggles that trigger coach attention
-- ==============================================

CREATE TABLE IF NOT EXISTS coach_triage_flags (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Flag details
    flag_type VARCHAR(50) NOT NULL, -- 'missed_workouts', 'low_motivation', 'plateau', 'overtraining', 'nutrition_slip'
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    ai_suggestion TEXT, -- AI-generated suggestion for coach

    -- Context data
    context_data JSONB DEFAULT '{}'::jsonb,
    -- e.g. {"missed_days": 3, "last_workout": "2024-01-10", "readiness_trend": "declining"}

    -- Resolution
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'acknowledged', 'resolved', 'dismissed'
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_coach ON coach_triage_flags(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_triage_client ON coach_triage_flags(client_id);

ALTER TABLE coach_triage_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage triage flags" ON coach_triage_flags
    FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Clients can view own flags" ON coach_triage_flags
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ==============================================
-- CONTEXTUAL NUTRITION RECOMMENDATIONS
-- Post-workout nutrition suggestions
-- ==============================================

CREATE TABLE IF NOT EXISTS nutrition_recommendations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Context
    recommendation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    trigger_type VARCHAR(50) NOT NULL, -- 'post_workout', 'pre_workout', 'rest_day', 'carb_up', 'recovery'
    workout_type VARCHAR(100), -- e.g. 'heavy_legs', 'upper_push', 'cardio'

    -- Recommendation
    title VARCHAR(255),
    message TEXT NOT NULL,
    macro_adjustments JSONB DEFAULT '{}'::jsonb,
    -- e.g. {"protein_add": 30, "carbs_add": 50, "reasoning": "Heavy leg day requires extra glycogen"}

    -- Status
    was_viewed BOOLEAN DEFAULT false,
    was_followed BOOLEAN,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_rec_client ON nutrition_recommendations(client_id, recommendation_date);

ALTER TABLE nutrition_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own nutrition recs" ON nutrition_recommendations
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage nutrition recs" ON nutrition_recommendations
    FOR ALL USING (true);

-- ==============================================
-- STREAKS TABLE (for gamification tracking)
-- ==============================================

CREATE TABLE IF NOT EXISTS client_streaks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    streak_type VARCHAR(50) NOT NULL, -- 'workout', 'nutrition', 'readiness', 'checkin'
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_streak_client_type ON client_streaks(client_id, streak_type);

ALTER TABLE client_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own streaks" ON client_streaks
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage streaks" ON client_streaks
    FOR ALL USING (true);

-- ==============================================
-- TRIGGERS
-- ==============================================

CREATE TRIGGER update_daily_readiness_timestamp
    BEFORE UPDATE ON daily_readiness
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_intensity_schedule_timestamp
    BEFORE UPDATE ON workout_intensity_schedule
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

CREATE TRIGGER update_triage_flags_timestamp
    BEFORE UPDATE ON coach_triage_flags
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
