-- Global Exercise Reference Links
-- Allows coaches to save reference links (YouTube, Instagram, etc.) globally per exercise name.
-- When an exercise is added to a workout, any saved global references auto-populate.

CREATE TABLE IF NOT EXISTS coach_exercise_references (
    id SERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name VARCHAR(255) NOT NULL,
    reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each coach can have one set of global references per exercise name
    UNIQUE(coach_id, exercise_name)
);

-- Index for fast lookups by coach
CREATE INDEX IF NOT EXISTS idx_coach_exercise_refs_coach_id ON coach_exercise_references(coach_id);

-- Index for fast lookups by coach + exercise name
CREATE INDEX IF NOT EXISTS idx_coach_exercise_refs_lookup ON coach_exercise_references(coach_id, exercise_name);

-- RLS policies
ALTER TABLE coach_exercise_references ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own global references
CREATE POLICY "Coaches can view own exercise references"
    ON coach_exercise_references FOR SELECT
    USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own exercise references"
    ON coach_exercise_references FOR INSERT
    WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own exercise references"
    ON coach_exercise_references FOR UPDATE
    USING (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own exercise references"
    ON coach_exercise_references FOR DELETE
    USING (coach_id = auth.uid());

-- Service role bypass for API calls
CREATE POLICY "Service role full access to exercise references"
    ON coach_exercise_references FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE coach_exercise_references IS 'Stores globally saved reference links per exercise per coach. When a coach saves links globally for an exercise like "Lunge", those links auto-populate any future use of that exercise.';
COMMENT ON COLUMN coach_exercise_references.exercise_name IS 'Normalized exercise name (case-insensitive matching via LOWER())';
COMMENT ON COLUMN coach_exercise_references.reference_links IS 'Array of reference link objects: [{"url": "...", "title": "...", "type": "youtube|instagram|generic"}]';
