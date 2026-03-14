-- Coach Challenges - allows coaches to create challenges for clients
-- Challenge types: gym_checkin, weight_loss, consistency, water_intake, steps, custom

-- Main challenges table (created by coach)
CREATE TABLE IF NOT EXISTS coach_challenges (
    id SERIAL PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    challenge_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    -- Target settings (varies by type)
    target_value NUMERIC,           -- e.g. target weight, daily water oz, daily steps
    target_unit VARCHAR(50),        -- e.g. 'lbs', 'oz', 'steps', 'days'
    frequency VARCHAR(20) DEFAULT 'daily', -- daily, weekly, one_time
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, cancelled
    assign_to VARCHAR(20) DEFAULT 'all', -- 'all' or 'selected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge participants (which clients are in which challenge)
CREATE TABLE IF NOT EXISTS challenge_participants (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES coach_challenges(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active', -- active, completed, dropped
    UNIQUE(challenge_id, client_id)
);

-- Daily progress logs for challenges
CREATE TABLE IF NOT EXISTS challenge_progress (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES coach_challenges(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    value NUMERIC,                  -- The logged value (weight, oz, steps, etc.)
    completed BOOLEAN DEFAULT FALSE, -- For simple check-in type challenges
    photo_url TEXT,                  -- Optional proof photo
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(challenge_id, client_id, log_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challenges_coach ON coach_challenges(coach_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON coach_challenges(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_participants_client ON challenge_participants(client_id);
CREATE INDEX IF NOT EXISTS idx_progress_challenge_date ON challenge_progress(challenge_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_progress_client ON challenge_progress(client_id, log_date DESC);

-- Enable RLS
ALTER TABLE coach_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coach_challenges
CREATE POLICY "Coaches can manage own challenges" ON coach_challenges
    FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Clients can view challenges they participate in" ON coach_challenges
    FOR SELECT USING (
        id IN (
            SELECT challenge_id FROM challenge_participants
            WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
        )
    );

-- RLS Policies for challenge_participants
CREATE POLICY "Coaches can manage participants for own challenges" ON challenge_participants
    FOR ALL USING (
        challenge_id IN (SELECT id FROM coach_challenges WHERE coach_id = auth.uid())
    );

CREATE POLICY "Clients can view own participation" ON challenge_participants
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- RLS Policies for challenge_progress
CREATE POLICY "Coaches can view progress for own challenges" ON challenge_progress
    FOR SELECT USING (
        challenge_id IN (SELECT id FROM coach_challenges WHERE coach_id = auth.uid())
    );

CREATE POLICY "Clients can manage own progress" ON challenge_progress
    FOR ALL USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );
