-- Gym Proofs Table - timestamped photo proof that client went to the gym
CREATE TABLE IF NOT EXISTS gym_proofs (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    client_name VARCHAR(255), -- denormalized for easy display
    proof_date DATE NOT NULL DEFAULT CURRENT_DATE,
    proof_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_gym_proofs_client_date ON gym_proofs(client_id, proof_date DESC);
CREATE INDEX IF NOT EXISTS idx_gym_proofs_coach_date ON gym_proofs(coach_id, proof_date DESC);

-- Enable Row Level Security
ALTER TABLE gym_proofs ENABLE ROW LEVEL SECURITY;

-- Coaches can see and manage all gym proofs for their clients
CREATE POLICY "Coaches can manage client gym proofs" ON gym_proofs
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view their own gym proofs
CREATE POLICY "Clients can view own gym proofs" ON gym_proofs
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- Clients can insert their own gym proofs
CREATE POLICY "Clients can insert own gym proofs" ON gym_proofs
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );
