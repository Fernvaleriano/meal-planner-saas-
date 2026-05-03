-- Personal notes that clients leave on exercises, private to the client.
-- Notes are tied to exercise_name (case-insensitive) so they follow the
-- exercise across every workout it appears in. Coaches CANNOT see these.

CREATE TABLE IF NOT EXISTS client_exercise_personal_notes (
    id BIGSERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    exercise_name VARCHAR(255) NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for the hot-path lookup: "show me my notes for this exercise, newest first"
CREATE INDEX IF NOT EXISTS idx_client_personal_notes_lookup
    ON client_exercise_personal_notes (client_id, lower(exercise_name), created_at DESC);

ALTER TABLE client_exercise_personal_notes ENABLE ROW LEVEL SECURITY;

-- Only the owning client may read or write. Coaches have no access.
CREATE POLICY "Clients manage own personal exercise notes"
    ON client_exercise_personal_notes
    FOR ALL
    USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
    WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
