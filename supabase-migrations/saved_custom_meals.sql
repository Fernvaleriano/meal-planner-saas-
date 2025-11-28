-- Saved Custom Meals Table - coaches and clients can save custom meals to their library
-- These are reusable meal templates that can be applied to plans

CREATE TABLE IF NOT EXISTS saved_custom_meals (
    id SERIAL PRIMARY KEY,

    -- Either coach_id OR client_id must be set (not both)
    -- coach_id: for coach's personal meal library
    -- client_id: for client's personal meal library
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,

    -- Meal data stored as JSONB for flexibility
    -- Contains: name, type, calories, protein, carbs, fat, ingredients, instructions, source, isCustom
    meal_data JSONB NOT NULL,

    -- Denormalized fields for easier querying/display
    meal_name VARCHAR(1000) NOT NULL,
    meal_type VARCHAR(50), -- breakfast, lunch, dinner, snack
    calories INTEGER,
    protein DECIMAL(5,1),
    carbs DECIMAL(5,1),
    fat DECIMAL(5,1),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure either coach_id or client_id is set
    CONSTRAINT saved_meal_owner CHECK (
        (coach_id IS NOT NULL AND client_id IS NULL) OR
        (coach_id IS NULL AND client_id IS NOT NULL)
    )
);

-- Index for faster queries by coach or client
CREATE INDEX IF NOT EXISTS idx_saved_meals_coach ON saved_custom_meals(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_meals_client ON saved_custom_meals(client_id) WHERE client_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE saved_custom_meals ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own saved meals
CREATE POLICY "Coaches can view own saved meals" ON saved_custom_meals
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own saved meals" ON saved_custom_meals
    FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own saved meals" ON saved_custom_meals
    FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own saved meals" ON saved_custom_meals
    FOR DELETE USING (coach_id = auth.uid());

-- Clients can manage their own saved meals
CREATE POLICY "Clients can view own saved meals" ON saved_custom_meals
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can insert own saved meals" ON saved_custom_meals
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can delete own saved meals" ON saved_custom_meals
    FOR DELETE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_meals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS saved_custom_meals_updated_at ON saved_custom_meals;
CREATE TRIGGER saved_custom_meals_updated_at
    BEFORE UPDATE ON saved_custom_meals
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_meals_updated_at();
