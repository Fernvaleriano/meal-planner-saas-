-- Migration: Add show_avatar_in_greeting column to coaches table
-- Date: 2024-12-10
-- Description: Allows coaches to toggle whether their avatar appears in the client greeting

-- Add show_avatar_in_greeting column to coaches table (default true)
ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS show_avatar_in_greeting BOOLEAN DEFAULT true;

-- Add comment to document the column
COMMENT ON COLUMN coaches.show_avatar_in_greeting IS 'Whether to display coach avatar in client dashboard greeting';
