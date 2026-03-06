-- Activity Reactions - Coach reactions on priority dashboard items (PRs, workout notes)
-- Allows coaches to react with emojis to client PRs and workout notes

-- ==========================================
-- Activity Reactions Table
-- ==========================================
CREATE TABLE IF NOT EXISTS activity_reactions (
    id SERIAL PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,

    -- Type of activity item: 'client_pr' or 'workout_note'
    item_type VARCHAR(30) NOT NULL,

    -- ID of the related item (notification id for PRs, exercise_log id for notes)
    item_id VARCHAR(50) NOT NULL,

    -- Reaction emoji
    reaction VARCHAR(10) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One reaction per coach per item
    UNIQUE(coach_id, item_type, item_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_activity_reactions_coach ON activity_reactions(coach_id);
CREATE INDEX IF NOT EXISTS idx_activity_reactions_client ON activity_reactions(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_reactions_item ON activity_reactions(item_type, item_id);

-- Enable RLS
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own reactions
CREATE POLICY "Coaches can manage own activity reactions" ON activity_reactions
    FOR ALL USING (
        coach_id = auth.uid()
    );

-- Clients can view reactions on their own items
CREATE POLICY "Clients can view reactions on own items" ON activity_reactions
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );
