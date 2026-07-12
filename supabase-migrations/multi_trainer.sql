-- Migration: Multi-Trainer Gyms (Phase 1 — foundation)
-- ============================================================================
-- Lets ONE gym account (an existing coach account = the "gym owner") have
-- multiple trainers, each with their own login, where each trainer coaches a
-- subset of the gym's clients.
--
-- SAFETY MODEL — "first, do no harm":
--   * `clients.coach_id` NEVER changes. It always points at the gym owner.
--     Every existing query that filters by coach_id keeps working unchanged,
--     so the owner keeps seeing ALL their clients exactly as today.
--   * A new nullable `clients.trainer_id` is the ONLY new ownership layer.
--     NULL = handled by the gym owner directly (this is every existing client,
--     and stays the default). A trainer is just a filter on top.
--   * Everything is gated by `coach_settings.multi_trainer_enabled` (default
--     FALSE). With the flag off, nothing in the product behaves differently.
--
-- This migration is purely ADDITIVE (new table, new nullable column, new flag
-- column). It does not alter or drop anything existing.
-- ============================================================================

-- ==============================================
-- FEATURE FLAG
-- ==============================================

-- Per-gym toggle. Off by default → every existing coach is unaffected.
ALTER TABLE coach_settings
    ADD COLUMN IF NOT EXISTS multi_trainer_enabled BOOLEAN DEFAULT false;

-- ==============================================
-- GYM TRAINERS
-- ==============================================
-- One row per trainer working under a gym owner.
--   gym_coach_id   → the gym owner (an existing coaches / auth.users id).
--   trainer_user_id→ the trainer's OWN login (auth.users id). Null until the
--                    invite is accepted / account is created.
-- A trainer maps to exactly one gym in this phase (partial unique index below);
-- multi-gym trainers are a future extension.

CREATE TABLE IF NOT EXISTS gym_trainers (
    id SERIAL PRIMARY KEY,
    gym_coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trainer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Contact / display
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),

    -- 'trainer' (default) coaches only their assigned clients.
    -- 'manager' can see the whole gym (reserved for future use; treated like a
    -- trainer today unless the backend opts in).
    role VARCHAR(20) NOT NULL DEFAULT 'trainer',

    -- 'invited'  → row exists, no login yet
    -- 'active'   → can log in and coach their clients
    -- 'disabled' → login blocked, clients revert to owner view
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Whether this trainer may add new clients to the gym (counts against the
    -- gym owner's plan limit).
    can_create_clients BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One trainer email per gym.
    CONSTRAINT gym_trainers_gym_email_unique UNIQUE (gym_coach_id, email)
);

-- Lookups: "who are this gym's trainers?" and "which gym is this login a trainer of?"
CREATE INDEX IF NOT EXISTS idx_gym_trainers_gym ON gym_trainers(gym_coach_id);
CREATE INDEX IF NOT EXISTS idx_gym_trainers_user ON gym_trainers(trainer_user_id);

-- A given login is a trainer at exactly one gym (phase 1). Partial so multiple
-- not-yet-accepted invites (trainer_user_id IS NULL) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_trainers_user_unique
    ON gym_trainers(trainer_user_id)
    WHERE trainer_user_id IS NOT NULL;

-- ==============================================
-- CLIENT → TRAINER LINK
-- ==============================================
-- NULL = the gym owner handles this client directly (every existing client).
-- ON DELETE SET NULL: removing a trainer never orphans a client — it reverts to
-- the owner (who always still owns it via coach_id). Clients can't be lost.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES gym_trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_trainer ON clients(trainer_id);

-- ==============================================
-- RLS (defense in depth — backend functions use the service key and do their
-- own owner-only checks, but scope direct client access too)
-- ==============================================

ALTER TABLE gym_trainers ENABLE ROW LEVEL SECURITY;

-- Gym owner can see and manage all of their own gym's trainer rows.
DROP POLICY IF EXISTS "Gym owner manages own trainers" ON gym_trainers;
CREATE POLICY "Gym owner manages own trainers" ON gym_trainers
    FOR ALL USING (gym_coach_id = auth.uid());

-- A trainer can read their own row (to resolve their gym on login).
DROP POLICY IF EXISTS "Trainer can view own row" ON gym_trainers;
CREATE POLICY "Trainer can view own row" ON gym_trainers
    FOR SELECT USING (trainer_user_id = auth.uid());

-- ==============================================
-- updated_at trigger (reuse the existing gym helper)
-- ==============================================

DROP TRIGGER IF EXISTS update_gym_trainers_timestamp ON gym_trainers;
CREATE TRIGGER update_gym_trainers_timestamp
    BEFORE UPDATE ON gym_trainers
    FOR EACH ROW EXECUTE FUNCTION update_gym_updated_at();

-- ==============================================
-- Convenience: enable multi-trainer for a gym by email
-- ==============================================

CREATE OR REPLACE FUNCTION enable_multi_trainer_for_email(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NOT NULL THEN
        INSERT INTO coach_settings (coach_id, multi_trainer_enabled)
        VALUES (target_user_id, true)
        ON CONFLICT (coach_id)
        DO UPDATE SET multi_trainer_enabled = true, updated_at = NOW();
    END IF;
END;
$$;

-- To turn it on for the founder's gym:
--   SELECT enable_multi_trainer_for_email('contact@ziquefitness.com');
