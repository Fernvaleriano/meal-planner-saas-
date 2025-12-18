-- Add related_entry_id column to notifications table for diary entry linking
-- This allows notifications about diary reactions/comments to link back to the specific entry

-- Add the column (nullable to support existing notifications)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS related_entry_id INTEGER REFERENCES food_diary_entries(id) ON DELETE CASCADE;

-- Add metadata column for flexible additional data (like full food name, meal type, entry date)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Create index for faster lookups by entry_id
CREATE INDEX IF NOT EXISTS idx_notifications_entry ON notifications(related_entry_id) WHERE related_entry_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN notifications.related_entry_id IS 'Reference to the food diary entry this notification is about (reactions/comments)';
COMMENT ON COLUMN notifications.metadata IS 'Additional data like food_name, meal_type, entry_date for display purposes';
