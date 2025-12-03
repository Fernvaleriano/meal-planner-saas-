-- Add branding fields to coaches table for white-label emails
-- Run this in Supabase SQL Editor

-- Add business_name column if it doesn't exist
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS business_name TEXT;

-- Add logo_url column if it doesn't exist
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add brand_color column for future use
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#7c3aed';

-- Update RLS policies to allow coaches to update their own branding
-- (Should already be covered by existing policies, but adding for safety)
