-- Database schema for storing coach's meal plans

-- Create table for coach meal plans
CREATE TABLE IF NOT EXISTS coach_meal_plans (
  id BIGSERIAL PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name VARCHAR(255),
  plan_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on coach_id for faster queries
CREATE INDEX idx_coach_meal_plans_coach_id ON coach_meal_plans(coach_id);

-- Create index on created_at for sorting
CREATE INDEX idx_coach_meal_plans_created_at ON coach_meal_plans(created_at DESC);

-- Enable Row Level Security
ALTER TABLE coach_meal_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can only view their own meal plans
CREATE POLICY "Coaches can view own plans" ON coach_meal_plans
  FOR SELECT
  USING (auth.uid() = coach_id);

-- Policy: Coaches can insert their own meal plans
CREATE POLICY "Coaches can insert own plans" ON coach_meal_plans
  FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

-- Policy: Coaches can update their own meal plans
CREATE POLICY "Coaches can update own plans" ON coach_meal_plans
  FOR UPDATE
  USING (auth.uid() = coach_id);

-- Policy: Coaches can delete their own meal plans
CREATE POLICY "Coaches can delete own plans" ON coach_meal_plans
  FOR DELETE
  USING (auth.uid() = coach_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_coach_meal_plans_updated_at
  BEFORE UPDATE ON coach_meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
