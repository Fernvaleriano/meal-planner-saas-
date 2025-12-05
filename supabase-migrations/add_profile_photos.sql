-- Migration: Add profile_photo_url columns to coaches and clients tables
-- Date: 2024-12-05

-- Add profile_photo_url column to coaches table
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Add profile_photo_url column to clients table
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Create storage bucket for profile photos (run in Supabase dashboard or via API)
-- Note: This is done automatically by the Netlify function on first upload
-- Bucket name: profile-photos
-- Public: true
-- File size limit: 500KB (512000 bytes)

-- Add comment to document the columns
COMMENT ON COLUMN coaches.profile_photo_url IS 'URL to the coach profile photo stored in Supabase Storage';
COMMENT ON COLUMN clients.profile_photo_url IS 'URL to the client profile photo stored in Supabase Storage';
