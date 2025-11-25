-- Progress Photos Table Migration
-- Run this in your Supabase SQL Editor

-- Create the progress_photos table
CREATE TABLE IF NOT EXISTS progress_photos (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  photo_type VARCHAR(50) DEFAULT 'progress', -- 'front', 'side', 'back', 'progress'
  notes TEXT,
  taken_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_progress_photos_client_id ON progress_photos(client_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_coach_id ON progress_photos(coach_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_taken_date ON progress_photos(taken_date DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can view/manage photos for their clients
CREATE POLICY "Coaches can manage their clients photos"
ON progress_photos
FOR ALL
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- Policy: Clients can view their own photos
CREATE POLICY "Clients can view their own photos"
ON progress_photos
FOR SELECT
USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
  )
);

-- Policy: Clients can upload their own photos
CREATE POLICY "Clients can upload their own photos"
ON progress_photos
FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- STORAGE BUCKET SETUP (Run in Supabase Dashboard)
-- =====================================================
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket called "progress-photos"
-- 3. Set it to PUBLIC (so photos can be viewed via URL)
-- 4. Add the following policy for the bucket:

-- Storage Policy for uploads (allow authenticated users):
-- Target: storage.objects
-- Operation: INSERT
-- Policy: bucket_id = 'progress-photos' AND auth.role() = 'authenticated'

-- Storage Policy for reads (public access):
-- Target: storage.objects
-- Operation: SELECT
-- Policy: bucket_id = 'progress-photos'

-- Storage Policy for deletes (authenticated users own uploads):
-- Target: storage.objects
-- Operation: DELETE
-- Policy: bucket_id = 'progress-photos' AND auth.role() = 'authenticated'
