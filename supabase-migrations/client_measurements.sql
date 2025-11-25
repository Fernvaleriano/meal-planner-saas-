-- Client Measurements Table for tracking weight and body measurements over time
CREATE TABLE IF NOT EXISTS client_measurements (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Date of measurement
    measured_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Weight
    weight DECIMAL(5,1),  -- e.g., 185.5 lbs
    weight_unit VARCHAR(10) DEFAULT 'lbs',  -- 'lbs' or 'kg'

    -- Body fat (optional)
    body_fat_percentage DECIMAL(4,1),  -- e.g., 15.5%

    -- Body measurements (in inches or cm)
    chest DECIMAL(5,1),
    waist DECIMAL(5,1),
    hips DECIMAL(5,1),
    left_arm DECIMAL(5,1),
    right_arm DECIMAL(5,1),
    left_thigh DECIMAL(5,1),
    right_thigh DECIMAL(5,1),
    measurement_unit VARCHAR(10) DEFAULT 'in',  -- 'in' or 'cm'

    -- Notes
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_measurements_client_date ON client_measurements(client_id, measured_date DESC);

-- Enable Row Level Security
ALTER TABLE client_measurements ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can manage measurements for their clients
CREATE POLICY "Coaches can manage their clients measurements" ON client_measurements
    FOR ALL USING (coach_id = auth.uid());

-- Policy: Clients can view and add their own measurements
CREATE POLICY "Clients can view own measurements" ON client_measurements
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Clients can insert own measurements" ON client_measurements
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Add coach_notes column to coach_meal_plans if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coach_meal_plans' AND column_name = 'coach_notes'
    ) THEN
        ALTER TABLE coach_meal_plans ADD COLUMN coach_notes TEXT;
    END IF;
END $$;
