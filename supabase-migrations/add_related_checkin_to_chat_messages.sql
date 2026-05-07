-- Allow chat_messages to be tied to a specific check-in so coach responses
-- and client replies form a threaded conversation under each check-in.
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS related_checkin_id INTEGER
    REFERENCES client_checkins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_related_checkin
    ON chat_messages(related_checkin_id)
    WHERE related_checkin_id IS NOT NULL;
