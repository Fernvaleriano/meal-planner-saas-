-- Notifications Table - in-app notifications for coaches and clients
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,

    -- Recipient (either coach or client)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- For coaches (direct user)
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE, -- For clients (via client record)

    -- Notification details
    type VARCHAR(50) NOT NULL, -- 'checkin_submitted', 'coach_responded', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT,

    -- Related entities
    related_checkin_id INTEGER REFERENCES client_checkins(id) ON DELETE CASCADE,
    related_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id, is_read, created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Coaches can view their own notifications
CREATE POLICY "Coaches can view own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- Coaches can update their own notifications (mark as read)
CREATE POLICY "Coaches can update own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- Clients can view their own notifications
CREATE POLICY "Clients can view own notifications" ON notifications
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can update their own notifications (mark as read)
CREATE POLICY "Clients can update own notifications" ON notifications
    FOR UPDATE USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Service role can insert notifications (via Netlify functions)
-- Note: Service role bypasses RLS, so no insert policy needed for functions
