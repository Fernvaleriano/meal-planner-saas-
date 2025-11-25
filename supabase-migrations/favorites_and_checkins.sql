-- Meal Favorites Table - clients can save favorite meals
CREATE TABLE IF NOT EXISTS meal_favorites (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    meal_name VARCHAR(500) NOT NULL,
    meal_type VARCHAR(50), -- breakfast, lunch, dinner, snack
    calories INTEGER,
    protein DECIMAL(5,1),
    carbs DECIMAL(5,1),
    fat DECIMAL(5,1),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_favorites_client ON meal_favorites(client_id);

-- Enable Row Level Security
ALTER TABLE meal_favorites ENABLE ROW LEVEL SECURITY;

-- Coaches can manage favorites for their clients
CREATE POLICY "Coaches can manage client favorites" ON meal_favorites
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view and manage their own favorites
CREATE POLICY "Clients can view own favorites" ON meal_favorites
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Clients can insert own favorites" ON meal_favorites
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Clients can delete own favorites" ON meal_favorites
    FOR DELETE USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- ==============================================

-- Client Check-ins Table - weekly progress updates
CREATE TABLE IF NOT EXISTS client_checkins (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Progress Questions
    weight DECIMAL(5,1),
    weight_unit VARCHAR(10) DEFAULT 'lbs',
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5), -- 1-5 scale
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 5), -- 1-5 scale
    hunger_level INTEGER CHECK (hunger_level >= 1 AND hunger_level <= 5), -- 1-5 scale
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 5), -- 1-5 scale

    -- Compliance
    meal_plan_adherence INTEGER CHECK (meal_plan_adherence >= 0 AND meal_plan_adherence <= 100), -- percentage
    workouts_completed INTEGER DEFAULT 0,
    workouts_planned INTEGER DEFAULT 0,
    water_intake VARCHAR(50), -- e.g., "8 glasses", "2 liters"

    -- Open Feedback
    wins TEXT, -- What went well this week
    challenges TEXT, -- What was difficult
    questions TEXT, -- Questions for coach
    notes TEXT, -- Additional notes

    -- Coach Response
    coach_feedback TEXT,
    coach_responded_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_checkins_client_date ON client_checkins(client_id, checkin_date DESC);

-- Enable Row Level Security
ALTER TABLE client_checkins ENABLE ROW LEVEL SECURITY;

-- Coaches can manage check-ins for their clients
CREATE POLICY "Coaches can manage client checkins" ON client_checkins
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view their own check-ins
CREATE POLICY "Clients can view own checkins" ON client_checkins
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can insert their own check-ins
CREATE POLICY "Clients can insert own checkins" ON client_checkins
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can update their own check-ins (before coach responds)
CREATE POLICY "Clients can update own checkins" ON client_checkins
    FOR UPDATE USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
        AND coach_responded_at IS NULL
    );
