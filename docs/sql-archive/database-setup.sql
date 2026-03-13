-- SQL script to create the shared_meal_plans table in Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Create the shared_meal_plans table
CREATE TABLE IF NOT EXISTS shared_meal_plans (
  id BIGSERIAL PRIMARY KEY,
  share_id VARCHAR(20) UNIQUE NOT NULL,
  plan_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on share_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_shared_meal_plans_share_id ON shared_meal_plans(share_id);

-- Create an index on created_at for cleanup/analytics
CREATE INDEX IF NOT EXISTS idx_shared_meal_plans_created_at ON shared_meal_plans(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE shared_meal_plans ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow anyone to read shared plans (public access)
CREATE POLICY "Public read access for shared meal plans"
ON shared_meal_plans FOR SELECT
USING (true);

-- Create a policy to allow authenticated users to insert shared plans
CREATE POLICY "Authenticated users can create shared plans"
ON shared_meal_plans FOR INSERT
WITH CHECK (true);

-- Optional: Create a policy to allow updates (if you want to support plan editing)
CREATE POLICY "Anyone can update shared plans"
ON shared_meal_plans FOR UPDATE
USING (true);

-- Grant usage on the sequence to anon and authenticated roles
GRANT USAGE ON SEQUENCE shared_meal_plans_id_seq TO anon;
GRANT USAGE ON SEQUENCE shared_meal_plans_id_seq TO authenticated;

-- Grant permissions on the table
GRANT SELECT, INSERT, UPDATE ON shared_meal_plans TO anon;
GRANT SELECT, INSERT, UPDATE ON shared_meal_plans TO authenticated;

COMMENT ON TABLE shared_meal_plans IS 'Stores shared meal plans that can be accessed via shareable links';
COMMENT ON COLUMN shared_meal_plans.share_id IS 'Unique identifier used in the shareable URL';
COMMENT ON COLUMN shared_meal_plans.plan_data IS 'Complete meal plan data stored as JSONB';
