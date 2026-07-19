-- Pep Talks - full-screen popup messages that appear when a client opens the app.
-- Coach composes title + optional body + optional video, picks recipients
-- (all clients OR specific clients), and clients see the popup until they've
-- finished watching the video (or tapped "Got it" for text-only).

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS pep_talks (
    id SERIAL PRIMARY KEY,

    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,
    body TEXT,                                  -- optional motivational message text

    video_url TEXT,                             -- optional Supabase Storage public URL
    video_duration_seconds INTEGER,             -- captured on upload so we can compute 90% threshold

    -- 'all' = every client of this coach, 'specific' = use pep_talk_recipients rows
    recipient_type VARCHAR(10) NOT NULL DEFAULT 'all'
        CHECK (recipient_type IN ('all', 'specific')),

    -- mandatory = client must read/watch and tap "Got it" before they can close
    -- the popup. FALSE = dismissible (X + tap-outside). Default TRUE.
    mandatory BOOLEAN NOT NULL DEFAULT TRUE,

    archived BOOLEAN NOT NULL DEFAULT FALSE,    -- coach archives -> stops popping up
    archived_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Must have either a body or a video; an empty pep talk makes no sense.
    CONSTRAINT pep_talks_has_content CHECK (
        (body IS NOT NULL AND length(trim(body)) > 0) OR video_url IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_pep_talks_coach
    ON pep_talks(coach_id, archived, created_at DESC);

-- Explicit recipient list for recipient_type='specific'. Coaches can target
-- one client, several clients, or leave this empty and use recipient_type='all'.
CREATE TABLE IF NOT EXISTS pep_talk_recipients (
    pep_talk_id INTEGER NOT NULL REFERENCES pep_talks(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (pep_talk_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_pep_talk_recipients_client
    ON pep_talk_recipients(client_id);

-- Per-client view tracking. A row is upserted the first time the client
-- opens the popup; viewed_at flips when they finish the video (or "Got it"
-- for text-only). dismiss_count climbs every time they soft-close without
-- viewing, which is fine — we just keep showing it.
CREATE TABLE IF NOT EXISTS pep_talk_views (
    pep_talk_id INTEGER NOT NULL REFERENCES pep_talks(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    first_opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    viewed_at TIMESTAMP WITH TIME ZONE,         -- null = still unviewed
    dismiss_count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (pep_talk_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_pep_talk_views_unviewed
    ON pep_talk_views(client_id, viewed_at)
    WHERE viewed_at IS NULL;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE pep_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_talk_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_talk_views ENABLE ROW LEVEL SECURITY;

-- pep_talks: coach owns the row; clients only see pep talks they're a recipient of.
CREATE POLICY "Coaches can view own pep talks" ON pep_talks
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can create pep talks" ON pep_talks
    FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own pep talks" ON pep_talks
    FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own pep talks" ON pep_talks
    FOR DELETE USING (coach_id = auth.uid());

-- Clients see a pep talk if it's not archived AND either targets 'all' for
-- their coach, or they're in the recipients list.
CREATE POLICY "Clients can view targeted pep talks" ON pep_talks
    FOR SELECT USING (
        archived = FALSE
        AND (
            (
                recipient_type = 'all'
                AND coach_id IN (
                    SELECT coach_id FROM clients WHERE user_id = auth.uid()
                )
            )
            OR id IN (
                SELECT pt.pep_talk_id FROM pep_talk_recipients pt
                WHERE pt.client_id IN (
                    SELECT id FROM clients WHERE user_id = auth.uid()
                )
            )
        )
    );

-- pep_talk_recipients: coach manages, clients can read their own rows
CREATE POLICY "Coaches manage own pep talk recipients" ON pep_talk_recipients
    FOR ALL USING (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    )
    WITH CHECK (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    );

CREATE POLICY "Clients can view own pep talk recipients" ON pep_talk_recipients
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- pep_talk_views: coach can read aggregate views for their pep talks; clients
-- read and write their own view rows. The mark-viewed Netlify function uses
-- the service key (which bypasses RLS) so we can't be spoofed by the client
-- claiming to have finished the video.
CREATE POLICY "Coaches can view pep talk views" ON pep_talk_views
    FOR SELECT USING (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    );

CREATE POLICY "Clients can view own pep talk views" ON pep_talk_views
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can insert own pep talk views" ON pep_talk_views
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can update own pep talk views" ON pep_talk_views
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- ============================================================================
-- Storage bucket for pep talk videos
-- ============================================================================

-- Public-read bucket so the <video> tag in the popup can stream the file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pep-talk-videos',
    'pep-talk-videos',
    TRUE,
    314572800,                                  -- 300 MB cap per file
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated coaches can upload to the bucket (RLS object policies).
-- Public SELECT is already granted by the project-wide
-- "Allow public access n3qp65_0" policy that covers every public bucket, so
-- we don't add a redundant bucket-scoped read policy here.
CREATE POLICY "Authenticated coaches can upload pep talk videos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'pep-talk-videos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Coaches can delete own pep talk videos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'pep-talk-videos'
        AND owner = auth.uid()
    );
