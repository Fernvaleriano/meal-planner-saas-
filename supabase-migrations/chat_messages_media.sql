-- Add media support and soft-delete to chat_messages

-- Media columns for photo/video/GIF attachments
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) CHECK (media_type IN ('image', 'video', 'gif'));

-- Allow message to be nullable (media-only messages)
ALTER TABLE chat_messages ALTER COLUMN message DROP NOT NULL;

-- Soft-delete support
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Delete policy for coaches (own sent messages)
CREATE POLICY "Coaches can delete own sent messages" ON chat_messages
    FOR DELETE USING (coach_id = auth.uid() AND sender_type = 'coach');
