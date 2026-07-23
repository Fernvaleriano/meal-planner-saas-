-- Powerlifting + Bodybuilding coaching features (piloting on Goliath Strength)
-- Applied to prod 2026-07-23 via Supabase MCP (migration name: athlete_pl_bb_features).

-- 1) Lift maxes: current + historical 1RMs per lift, powers %1RM prescriptions
CREATE TABLE IF NOT EXISTS athlete_lift_maxes (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  exercise_id integer,
  exercise_name varchar(255) NOT NULL,
  lift_key varchar(50),
  max_weight numeric NOT NULL,
  weight_unit varchar(10) DEFAULT 'lbs',
  source varchar(20) DEFAULT 'tested',
  achieved_date date DEFAULT CURRENT_DATE,
  notes text,
  is_current boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lift_maxes_client ON athlete_lift_maxes(client_id, is_current);
ALTER TABLE athlete_lift_maxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients view own maxes" ON athlete_lift_maxes FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients insert own maxes" ON athlete_lift_maxes FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Coaches manage client maxes" ON athlete_lift_maxes FOR ALL
  USING (coach_id = auth.uid());

-- 2) Competitions: powerlifting meets + bodybuilding shows
CREATE TABLE IF NOT EXISTS athlete_competitions (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  comp_type varchar(20) NOT NULL DEFAULT 'meet',
  name varchar(255) NOT NULL,
  comp_date date NOT NULL,
  location varchar(255),
  federation varchar(100),
  division varchar(100),
  weight_class varchar(50),
  goal_total numeric,
  status varchar(20) DEFAULT 'upcoming',
  attempts jsonb,
  results jsonb,
  checklist jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitions_client ON athlete_competitions(client_id, comp_date);
CREATE INDEX IF NOT EXISTS idx_competitions_coach ON athlete_competitions(coach_id, comp_date);
ALTER TABLE athlete_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients view own competitions" ON athlete_competitions FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Coaches manage client competitions" ON athlete_competitions FOR ALL
  USING (coach_id = auth.uid());

-- 3) Protocols: coach-managed, PRIVATE (enhancement / supplement / peak-week)
CREATE TABLE IF NOT EXISTS athlete_protocols (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  protocol_type varchar(30) NOT NULL DEFAULT 'supplement',
  title varchar(255),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  visible_to_client boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocols_client ON athlete_protocols(client_id, is_active);
ALTER TABLE athlete_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients view own visible protocols" ON athlete_protocols FOR SELECT
  USING (visible_to_client = true AND client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Coaches manage client protocols" ON athlete_protocols FOR ALL
  USING (coach_id = auth.uid());

-- 4) Bloodwork: marker panels over time, color-coded client-side
CREATE TABLE IF NOT EXISTS athlete_bloodwork (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  lab_name varchar(255),
  markers jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bloodwork_client ON athlete_bloodwork(client_id, test_date);
ALTER TABLE athlete_bloodwork ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients view own bloodwork" ON athlete_bloodwork FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients insert own bloodwork" ON athlete_bloodwork FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Coaches manage client bloodwork" ON athlete_bloodwork FOR ALL
  USING (coach_id = auth.uid());

-- 5) Bodybuilding fields on weekly check-ins
ALTER TABLE client_checkins
  ADD COLUMN IF NOT EXISTS digestion integer,
  ADD COLUMN IF NOT EXISTS soreness integer,
  ADD COLUMN IF NOT EXISTS motivation integer,
  ADD COLUMN IF NOT EXISTS pump_rating integer,
  ADD COLUMN IF NOT EXISTS cardio_completed integer,
  ADD COLUMN IF NOT EXISTS cardio_planned integer,
  ADD COLUMN IF NOT EXISTS avg_daily_steps integer,
  ADD COLUMN IF NOT EXISTS photos jsonb,
  ADD COLUMN IF NOT EXISTS posing_video_url text,
  ADD COLUMN IF NOT EXISTS posing_video_path text,
  ADD COLUMN IF NOT EXISTS coach_rating integer;

-- 6) Athlete profile blob on clients: weak points, comp prefs (sex/weight class)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS athlete_profile jsonb;
