-- Weight Proofs Table — timestamped photo proof of a scale reading
-- Mirrors gym_proofs but also stores the parsed weight value and a link
-- to the client_measurements row that holds it for charting.
CREATE TABLE IF NOT EXISTS weight_proofs (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    client_name VARCHAR(255),
    weight NUMERIC(6, 2) NOT NULL,
    weight_unit VARCHAR(10) NOT NULL DEFAULT 'lbs',
    measurement_id INTEGER REFERENCES client_measurements(id) ON DELETE SET NULL,
    proof_date DATE NOT NULL DEFAULT CURRENT_DATE,
    proof_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_proofs_client_date ON weight_proofs(client_id, proof_date DESC);
CREATE INDEX IF NOT EXISTS idx_weight_proofs_coach_date ON weight_proofs(coach_id, proof_date DESC);

ALTER TABLE weight_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage client weight proofs" ON weight_proofs
    FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Clients can view own weight proofs" ON weight_proofs
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Clients can insert own weight proofs" ON weight_proofs
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );
