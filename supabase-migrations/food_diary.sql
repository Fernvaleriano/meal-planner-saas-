-- Food Diary Tables - MyFitnessPal-style calorie tracking
-- Migration for tracking daily food intake

-- ==========================================
-- Calorie/Macro Goals Table
-- ==========================================
CREATE TABLE IF NOT EXISTS calorie_goals (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Daily targets
    calorie_goal INTEGER DEFAULT 2000,
    protein_goal DECIMAL(5,1) DEFAULT 150,
    carbs_goal DECIMAL(5,1) DEFAULT 200,
    fat_goal DECIMAL(5,1) DEFAULT 65,

    -- Optional additional targets
    fiber_goal DECIMAL(5,1),
    sugar_goal DECIMAL(5,1),
    sodium_goal DECIMAL(6,1),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One goal record per client
    UNIQUE(client_id)
);

-- Index for faster goal lookups by client
CREATE INDEX IF NOT EXISTS idx_calorie_goals_client ON calorie_goals(client_id);

-- Enable RLS
ALTER TABLE calorie_goals ENABLE ROW LEVEL SECURITY;

-- Coaches can manage goals for their clients
CREATE POLICY "Coaches can manage client calorie goals" ON calorie_goals
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view their own goals
CREATE POLICY "Clients can view own calorie goals" ON calorie_goals
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can update their own goals
CREATE POLICY "Clients can update own calorie goals" ON calorie_goals
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can insert their own goals
CREATE POLICY "Clients can insert own calorie goals" ON calorie_goals
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==========================================
-- Food Diary Entries Table
-- ==========================================
CREATE TABLE IF NOT EXISTS food_diary_entries (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Date and meal type
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    meal_type VARCHAR(50) NOT NULL, -- breakfast, lunch, dinner, snack

    -- Food details
    food_name VARCHAR(500) NOT NULL,
    brand VARCHAR(200),

    -- Serving info
    serving_size DECIMAL(8,2) DEFAULT 1,
    serving_unit VARCHAR(50) DEFAULT 'serving', -- g, oz, cup, serving, etc.
    number_of_servings DECIMAL(5,2) DEFAULT 1,

    -- Nutrition per entry (calculated: per-serving * number_of_servings)
    calories INTEGER NOT NULL DEFAULT 0,
    protein DECIMAL(6,1) DEFAULT 0,
    carbs DECIMAL(6,1) DEFAULT 0,
    fat DECIMAL(6,1) DEFAULT 0,
    fiber DECIMAL(5,1),
    sugar DECIMAL(5,1),
    sodium DECIMAL(6,1),

    -- External food database reference
    external_id VARCHAR(100), -- Edamam food ID or USDA fdc_id
    food_source VARCHAR(50), -- 'edamam', 'usda', 'custom', 'favorite'

    -- Quick-add flag (user entered macros directly without looking up)
    is_quick_add BOOLEAN DEFAULT FALSE,

    -- Notes
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_diary_client_date ON food_diary_entries(client_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_meal_type ON food_diary_entries(client_id, entry_date, meal_type);

-- Enable RLS
ALTER TABLE food_diary_entries ENABLE ROW LEVEL SECURITY;

-- Coaches can view their clients' diary entries
CREATE POLICY "Coaches can view client diary entries" ON food_diary_entries
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can manage diary entries for their clients
CREATE POLICY "Coaches can manage client diary entries" ON food_diary_entries
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view their own diary entries
CREATE POLICY "Clients can view own diary entries" ON food_diary_entries
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can insert their own diary entries
CREATE POLICY "Clients can insert own diary entries" ON food_diary_entries
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can update their own diary entries
CREATE POLICY "Clients can update own diary entries" ON food_diary_entries
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can delete their own diary entries
CREATE POLICY "Clients can delete own diary entries" ON food_diary_entries
    FOR DELETE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==========================================
-- Helper function to update timestamps
-- ==========================================
CREATE OR REPLACE FUNCTION update_diary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS food_diary_entries_updated_at ON food_diary_entries;
CREATE TRIGGER food_diary_entries_updated_at
    BEFORE UPDATE ON food_diary_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_diary_updated_at();

DROP TRIGGER IF EXISTS calorie_goals_updated_at ON calorie_goals;
CREATE TRIGGER calorie_goals_updated_at
    BEFORE UPDATE ON calorie_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_diary_updated_at();

-- ==========================================
-- View for daily summaries (optional convenience)
-- ==========================================
CREATE OR REPLACE VIEW daily_diary_summary AS
SELECT
    client_id,
    entry_date,
    SUM(calories) as total_calories,
    SUM(protein) as total_protein,
    SUM(carbs) as total_carbs,
    SUM(fat) as total_fat,
    SUM(fiber) as total_fiber,
    COUNT(*) as entry_count
FROM food_diary_entries
GROUP BY client_id, entry_date;
