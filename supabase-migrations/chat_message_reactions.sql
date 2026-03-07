-- Message Reactions - Store emoji reactions as JSONB on chat_messages
-- Format: [{"emoji": "❤️", "reactorType": "coach", "reactorId": "uuid-here"}, ...]

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]';
