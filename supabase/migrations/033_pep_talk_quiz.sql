-- Pep Talk Quizzes — a pep talk can now ask the client questions.
-- A quiz reuses everything a pep talk has (title, optional body/photo/video,
-- recipients, mandatory gate, view tracking) and adds 1+ questions. Each
-- question can offer multiple-choice options (with one marked correct so we
-- can score it), a written answer, a photo/video answer, or any combination.

-- 1. Flag a pep talk as a quiz. Its questions live in pep_talk_questions.
ALTER TABLE pep_talks
    ADD COLUMN IF NOT EXISTS is_quiz BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. A quiz's "content" is its questions, so it needn't have a body/photo/video.
--    Widen the content check to accept is_quiz rows.
ALTER TABLE pep_talks
    DROP CONSTRAINT IF EXISTS pep_talks_has_content;

ALTER TABLE pep_talks
    ADD CONSTRAINT pep_talks_has_content CHECK (
        is_quiz = TRUE
        OR (body IS NOT NULL AND length(trim(body)) > 0)
        OR video_url IS NOT NULL
        OR image_url IS NOT NULL
    );

-- 3. Questions belonging to a quiz pep talk.
CREATE TABLE IF NOT EXISTS pep_talk_questions (
    id SERIAL PRIMARY KEY,
    pep_talk_id INTEGER NOT NULL REFERENCES pep_talks(id) ON DELETE CASCADE,

    question_order INTEGER NOT NULL DEFAULT 0,
    question_text TEXT NOT NULL,

    -- Multiple-choice options as a JSON array of strings, e.g. ["A","B","C"].
    -- NULL / empty array = no multiple choice for this question.
    options JSONB,
    -- Index into options[] of the correct choice. NULL = not scored.
    correct_option INTEGER,

    allow_text BOOLEAN NOT NULL DEFAULT FALSE,   -- client may type a written answer
    allow_media BOOLEAN NOT NULL DEFAULT FALSE,  -- client may attach a photo/video

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pep_talk_questions_talk
    ON pep_talk_questions(pep_talk_id, question_order);

-- 4. One client's answer to one question. Upserted on (question_id, client_id)
--    so a re-submit overwrites rather than duplicates.
CREATE TABLE IF NOT EXISTS pep_talk_answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES pep_talk_questions(id) ON DELETE CASCADE,
    pep_talk_id INTEGER NOT NULL REFERENCES pep_talks(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    selected_option INTEGER,        -- index the client picked (NULL if none)
    is_correct BOOLEAN,             -- computed at submit vs correct_option (NULL if not scored)
    answer_text TEXT,               -- their written answer
    answer_media_url TEXT,          -- their uploaded photo/video (public URL)
    answer_media_type VARCHAR(10),  -- 'image' | 'video'

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT pep_talk_answers_unique UNIQUE (question_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_pep_talk_answers_talk
    ON pep_talk_answers(pep_talk_id, client_id);

-- ============================================================================
-- Row Level Security. All reads/writes go through Netlify functions using the
-- service key (which bypasses RLS), but we still enable RLS + owner policies as
-- defense-in-depth, mirroring the existing pep_talk tables.
-- ============================================================================

ALTER TABLE pep_talk_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_talk_answers ENABLE ROW LEVEL SECURITY;

-- Questions: only the owning coach gets direct table access. Clients read
-- questions exclusively through the list-pep-talks-for-client Netlify function
-- (service key), which strips correct_option — so we deliberately do NOT add a
-- client SELECT policy here, otherwise the answer key would be readable with
-- the anon key + a client JWT.
CREATE POLICY "Coaches manage own pep talk questions" ON pep_talk_questions
    FOR ALL USING (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    )
    WITH CHECK (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    );

-- Answers: coach who owns the pep talk can read them; clients read/write own.
CREATE POLICY "Coaches can read own pep talk answers" ON pep_talk_answers
    FOR SELECT USING (
        pep_talk_id IN (SELECT id FROM pep_talks WHERE coach_id = auth.uid())
    );

CREATE POLICY "Clients can read own pep talk answers" ON pep_talk_answers
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can insert own pep talk answers" ON pep_talk_answers
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

CREATE POLICY "Clients can update own pep talk answers" ON pep_talk_answers
    FOR UPDATE USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );
