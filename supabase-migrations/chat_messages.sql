-- Chat Messages - Direct messaging between coaches and clients
-- EverFit-style 1:1 coach-client messaging

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,

    -- Participants (coach UUID + client integer ID define the conversation)
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Message content
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('coach', 'client')),
    message TEXT NOT NULL,

    -- Read tracking
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast conversation queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages(coach_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_client
    ON chat_messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
    ON chat_messages(coach_id, client_id, is_read) WHERE is_read = FALSE;

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Coaches can read/write messages for their clients
CREATE POLICY "Coaches can view own chat messages" ON chat_messages
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can send chat messages" ON chat_messages
    FOR INSERT WITH CHECK (coach_id = auth.uid() AND sender_type = 'coach');

CREATE POLICY "Coaches can update own chat messages" ON chat_messages
    FOR UPDATE USING (coach_id = auth.uid());

-- Clients can view their own messages
CREATE POLICY "Clients can view own chat messages" ON chat_messages
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can send messages
CREATE POLICY "Clients can send chat messages" ON chat_messages
    FOR INSERT WITH CHECK (
        sender_type = 'client' AND
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can mark messages as read
CREATE POLICY "Clients can update own chat messages" ON chat_messages
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
