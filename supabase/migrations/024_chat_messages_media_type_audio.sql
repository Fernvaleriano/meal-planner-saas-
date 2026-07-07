-- Voice messages in chat: add 'audio' to the media_type whitelist.
-- Applied to production via Supabase MCP (July 2026) — kept here so the
-- schema history stays reproducible.
-- Existing values ('image','video','gif') are unchanged, so no data rewrite.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_media_type_check
  CHECK (media_type IN ('image', 'video', 'gif', 'audio'));
