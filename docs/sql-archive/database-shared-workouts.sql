-- SQL script to create the shared_workout_programs table in Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Create the shared_workout_programs table
CREATE TABLE IF NOT EXISTS shared_workout_programs (
  id BIGSERIAL PRIMARY KEY,
  share_id VARCHAR(20) UNIQUE NOT NULL,
  program_data JSONB NOT NULL,
  coach_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  coach_program_id INTEGER REFERENCES workout_programs(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE,
  cta_url TEXT,
  cta_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_workout_programs_share_id ON shared_workout_programs(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_workout_programs_coach_program_id ON shared_workout_programs(coach_program_id);
CREATE INDEX IF NOT EXISTS idx_shared_workout_programs_expires_at ON shared_workout_programs(expires_at);

ALTER TABLE shared_workout_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for shared workout programs"
ON shared_workout_programs FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create shared workout programs"
ON shared_workout_programs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update shared workout programs"
ON shared_workout_programs FOR UPDATE
USING (true);

GRANT USAGE ON SEQUENCE shared_workout_programs_id_seq TO anon;
GRANT USAGE ON SEQUENCE shared_workout_programs_id_seq TO authenticated;
