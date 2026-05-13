-- Migration 008: Per-client access gating, controlled by the coach.
--
-- Decouples client app access from Stripe subscription state. Coaches who
-- collect payment externally (cash, Venmo, bank transfer, etc.) should not
-- have their clients auto-locked when no Stripe row exists. Lockout now
-- only happens when the coach explicitly sets access_status = 'paused'.
--
-- Values:
--   'active' (default) — client has full access
--   'paused'           — client sees the lock screen until the coach resumes
--
-- Nullable handling on read: treat NULL as 'active' so existing rows behave
-- as before.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS access_status TEXT
    NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'paused'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS access_paused_at TIMESTAMPTZ;
