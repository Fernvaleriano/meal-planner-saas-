-- Diary Entry Interactions - Reactions and Comments from coaches
-- Migration for social engagement features on food diary entries

-- ==========================================
-- Diary Entry Reactions Table
-- ==========================================
-- Coaches can react to client diary entries with emojis
CREATE TABLE IF NOT EXISTS diary_entry_reactions (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER REFERENCES food_diary_entries(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,

    -- Reaction emoji (fire, muscle, heart, clap, star)
    reaction VARCHAR(10) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One reaction per coach per entry (can update the emoji)
    UNIQUE(entry_id, coach_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_diary_reactions_entry ON diary_entry_reactions(entry_id);
CREATE INDEX IF NOT EXISTS idx_diary_reactions_client ON diary_entry_reactions(client_id);
CREATE INDEX IF NOT EXISTS idx_diary_reactions_coach ON diary_entry_reactions(coach_id);

-- Enable RLS
ALTER TABLE diary_entry_reactions ENABLE ROW LEVEL SECURITY;

-- Coaches can add/manage reactions on their clients' entries
CREATE POLICY "Coaches can manage reactions on client entries" ON diary_entry_reactions
    FOR ALL USING (
        coach_id = auth.uid()
    );

-- Clients can view reactions on their own entries
CREATE POLICY "Clients can view reactions on own entries" ON diary_entry_reactions
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==========================================
-- Diary Entry Comments Table
-- ==========================================
-- Coaches can comment on client diary entries
CREATE TABLE IF NOT EXISTS diary_entry_comments (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER REFERENCES food_diary_entries(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,

    -- Comment content
    comment TEXT NOT NULL,

    -- For threaded replies (optional - client can reply to coach comment)
    parent_comment_id INTEGER REFERENCES diary_entry_comments(id) ON DELETE CASCADE,
    author_type VARCHAR(10) NOT NULL DEFAULT 'coach', -- 'coach' or 'client'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_diary_comments_entry ON diary_entry_comments(entry_id);
CREATE INDEX IF NOT EXISTS idx_diary_comments_client ON diary_entry_comments(client_id);
CREATE INDEX IF NOT EXISTS idx_diary_comments_coach ON diary_entry_comments(coach_id);
CREATE INDEX IF NOT EXISTS idx_diary_comments_created ON diary_entry_comments(created_at DESC);

-- Enable RLS
ALTER TABLE diary_entry_comments ENABLE ROW LEVEL SECURITY;

-- Coaches can add/manage their own comments
CREATE POLICY "Coaches can manage own comments" ON diary_entry_comments
    FOR ALL USING (
        coach_id = auth.uid()
    );

-- Clients can view comments on their own entries
CREATE POLICY "Clients can view comments on own entries" ON diary_entry_comments
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can add reply comments (author_type = 'client')
CREATE POLICY "Clients can add reply comments" ON diary_entry_comments
    FOR INSERT WITH CHECK (
        author_type = 'client' AND
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ==========================================
-- Trigger for updated_at
-- ==========================================
DROP TRIGGER IF EXISTS diary_comments_updated_at ON diary_entry_comments;
CREATE TRIGGER diary_comments_updated_at
    BEFORE UPDATE ON diary_entry_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_diary_updated_at();
