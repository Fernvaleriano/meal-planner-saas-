-- Message Reactions - Emoji reactions on chat messages
-- Allows coaches and clients to react to messages with emoji

CREATE TABLE IF NOT EXISTS chat_message_reactions (
    id SERIAL PRIMARY KEY,

    -- The message being reacted to
    message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,

    -- Who reacted
    reactor_type VARCHAR(10) NOT NULL CHECK (reactor_type IN ('coach', 'client')),
    reactor_id TEXT NOT NULL,  -- coach UUID or client integer ID as text

    -- The emoji reaction
    emoji TEXT NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One reaction per emoji per user per message
    UNIQUE(message_id, reactor_type, reactor_id, emoji)
);

-- Index for fast lookup of reactions on a message
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
    ON chat_message_reactions(message_id);

-- Enable Row Level Security
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- Coaches can view reactions on their messages
CREATE POLICY "Coaches can view reactions" ON chat_message_reactions
    FOR SELECT USING (
        message_id IN (
            SELECT id FROM chat_messages WHERE coach_id = auth.uid()
        )
    );

-- Coaches can add reactions
CREATE POLICY "Coaches can add reactions" ON chat_message_reactions
    FOR INSERT WITH CHECK (
        reactor_type = 'coach' AND
        message_id IN (
            SELECT id FROM chat_messages WHERE coach_id = auth.uid()
        )
    );

-- Coaches can remove their own reactions
CREATE POLICY "Coaches can remove own reactions" ON chat_message_reactions
    FOR DELETE USING (
        reactor_type = 'coach' AND reactor_id = auth.uid()::text
    );

-- Clients can view reactions on their messages
CREATE POLICY "Clients can view reactions" ON chat_message_reactions
    FOR SELECT USING (
        message_id IN (
            SELECT id FROM chat_messages WHERE client_id IN (
                SELECT id FROM clients WHERE user_id = auth.uid()
            )
        )
    );

-- Clients can add reactions
CREATE POLICY "Clients can add reactions" ON chat_message_reactions
    FOR INSERT WITH CHECK (
        reactor_type = 'client' AND
        message_id IN (
            SELECT id FROM chat_messages WHERE client_id IN (
                SELECT id FROM clients WHERE user_id = auth.uid()
            )
        )
    );

-- Clients can remove their own reactions
CREATE POLICY "Clients can remove own reactions" ON chat_message_reactions
    FOR DELETE USING (
        reactor_type = 'client' AND
        reactor_id IN (
            SELECT id::text FROM clients WHERE user_id = auth.uid()
        )
    );

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reactions;
