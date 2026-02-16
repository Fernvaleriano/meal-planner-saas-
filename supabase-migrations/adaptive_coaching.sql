-- Migration: Adaptive Fitness Coaching (Lean)
-- 4 tables: daily_readiness, health_span_scores, nutrition_recommendations, client_streaks
-- Powers: readiness scoring, Health Span metric, contextual post-workout nutrition

-- ==============================================
-- DAILY READINESS ASSESSMENTS
-- Tracks sleep, stress, soreness, mood to compute readiness scores
-- ==============================================

CREATE TABLE IF NOT EXISTS daily_readiness (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Sleep metrics (1-10 scale)
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
    sleep_hours DECIMAL(3,1),

    -- Stress & recovery (1-10 scale)
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
    muscle_soreness INTEGER CHECK (muscle_soreness >= 1 AND muscle_soreness <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    mood INTEGER CHECK (mood >= 1 AND mood <= 10),

    -- Computed readiness score (0-100)
    readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100),

    -- AI recommendation based on readiness
    intensity_recommendation VARCHAR(20), -- 'deload', 'easy', 'moderate', 'hard', 'peak'
    ai_recommendation TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_client_date ON daily_readiness(client_id, assessment_date);
CREATE INDEX IF NOT EXISTS idx_readiness_coach ON daily_readiness(coach_id);

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
-- HEALTH SPAN SCORE (Composite wellness metric)
-- ==============================================

CREATE TABLE IF NOT EXISTS health_span_scores (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    score_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Component scores (0-100 each)
    training_score INTEGER DEFAULT 0,
    nutrition_score INTEGER DEFAULT 0,
    recovery_score INTEGER DEFAULT 0,
    consistency_score INTEGER DEFAULT 0,

    -- Composite Health Span score (0-100, weighted average)
    health_span_score INTEGER DEFAULT 0,

    -- Trend data
    score_change INTEGER DEFAULT 0,
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
-- CONTEXTUAL NUTRITION RECOMMENDATIONS
-- ==============================================

CREATE TABLE IF NOT EXISTS nutrition_recommendations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    recommendation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    trigger_type VARCHAR(50) NOT NULL, -- 'post_workout', 'pre_workout', 'rest_day'
    workout_type VARCHAR(100),

    title VARCHAR(255),
    message TEXT NOT NULL,
    macro_adjustments JSONB DEFAULT '{}'::jsonb,

    was_viewed BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_rec_client ON nutrition_recommendations(client_id, recommendation_date);

ALTER TABLE nutrition_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own nutrition recs" ON nutrition_recommendations
    FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "Service can manage nutrition recs" ON nutrition_recommendations
    FOR ALL USING (true);

-- ==============================================
-- STREAKS TABLE (powers Health Span consistency score)
-- ==============================================

CREATE TABLE IF NOT EXISTS client_streaks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    streak_type VARCHAR(50) NOT NULL, -- 'workout', 'nutrition', 'readiness'
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
-- TRIGGER
-- ==============================================

CREATE TRIGGER update_daily_readiness_timestamp
    BEFORE UPDATE ON daily_readiness
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();
