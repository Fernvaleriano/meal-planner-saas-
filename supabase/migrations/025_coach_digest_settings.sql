-- Opt-out settings for the daily coach digest email
-- (netlify/functions/send-daily-coach-digest.js).
--
-- The function treats a missing row — or this table not existing yet — as
-- "enabled", so this migration is optional for the feature to work. It only
-- needs to exist once a coach wants to turn the digest OFF.

CREATE TABLE IF NOT EXISTS coach_digest_settings (
    coach_id UUID PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coach_digest_settings ENABLE ROW LEVEL SECURITY;

-- Coaches can read and manage only their own digest setting.
-- The scheduled function bypasses RLS via the service-role key.
CREATE POLICY "Coaches manage own digest settings"
    ON coach_digest_settings
    FOR ALL
    USING (auth.uid() = coach_id)
    WITH CHECK (auth.uid() = coach_id);
