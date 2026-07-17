-- Migration: Multi-Trainer Gyms (Phase 2 — trainer read access)
-- Applied to prod 2026-07-17 (with 034_multi_trainer_gyms.sql).
--
-- Lets an ACTIVE gym trainer's own login read the data their coach pages need,
-- scoped to the gym they belong to and the clients assigned to them.
-- SELECT-only and additive: no existing policy is changed, and for any user who
-- is not an active trainer these policies match nothing.

-- Helper: the calling user's active trainer row id (null when not a trainer).
CREATE OR REPLACE FUNCTION public.current_trainer_id()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM gym_trainers
  WHERE trainer_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- Helper: the gym (owner coach id) the calling user trains for.
CREATE OR REPLACE FUNCTION public.current_trainer_gym()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gym_coach_id FROM gym_trainers
  WHERE trainer_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_trainer_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_trainer_gym() TO authenticated, anon;

-- Trainer can read their gym's coach row (branding, name, subscription status —
-- a trainer inherits the gym's subscription).
DROP POLICY IF EXISTS "Trainers can view their gym" ON coaches;
CREATE POLICY "Trainers can view their gym" ON coaches
    FOR SELECT USING (id = current_trainer_gym());

-- Trainer can read the clients assigned to them (and only those).
DROP POLICY IF EXISTS "Trainers can view assigned clients" ON clients;
CREATE POLICY "Trainers can view assigned clients" ON clients
    FOR SELECT USING (trainer_id IS NOT NULL AND trainer_id = current_trainer_id());

-- Trainer can read chat messages for their assigned clients (needed for the
-- messages page realtime subscription, which filters coach_id = gym).
DROP POLICY IF EXISTS "Trainers can view assigned clients messages" ON chat_messages;
CREATE POLICY "Trainers can view assigned clients messages" ON chat_messages
    FOR SELECT USING (
        coach_id = current_trainer_gym()
        AND client_id IN (SELECT id FROM clients WHERE trainer_id = current_trainer_id())
    );

-- Trainer can read meal plans of their assigned clients (client list plan counts).
DROP POLICY IF EXISTS "Trainers can view assigned clients meal plans" ON coach_meal_plans;
CREATE POLICY "Trainers can view assigned clients meal plans" ON coach_meal_plans
    FOR SELECT USING (
        coach_id = current_trainer_gym()
        AND client_id IN (SELECT id FROM clients WHERE trainer_id = current_trainer_id())
    );
