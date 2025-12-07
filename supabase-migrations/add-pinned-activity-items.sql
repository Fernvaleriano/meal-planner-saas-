-- Add pinned functionality to activity items
-- This allows coaches to pin important items so they stay visible in their briefing

-- Add is_pinned column to track pinned items
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Add pinned_at timestamp to track when an item was pinned
ALTER TABLE dismissed_activity_items ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups of pinned items
CREATE INDEX IF NOT EXISTS idx_dismissed_activity_pinned ON dismissed_activity_items(coach_id, is_pinned) WHERE is_pinned = TRUE;

-- Update policy to allow coaches to update their own items (for pin/unpin)
CREATE POLICY "Coaches can update own dismissals" ON dismissed_activity_items
    FOR UPDATE
    USING (auth.uid() = coach_id)
    WITH CHECK (auth.uid() = coach_id);

-- Add comment for documentation
COMMENT ON COLUMN dismissed_activity_items.is_pinned IS 'If true, this item stays visible in the briefing until unpinned';
COMMENT ON COLUMN dismissed_activity_items.pinned_at IS 'Timestamp when the item was pinned';
