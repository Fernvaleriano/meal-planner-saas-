-- Migration 005: Add unique constraint on client_subscriptions (client_id, coach_id)
--
-- Without this constraint, the stripe-connect-webhook handler's upsert
-- (using `onConflict: 'client_id,coach_id'`) silently fails with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- The handler does not check the upsert's return value, so the error is
-- swallowed, the function returns 200, and the row never lands in
-- client_subscriptions — leaving the client billing UI and the coach
-- revenue dashboard out of sync with Stripe.
--
-- The design intent is one subscription row per (client, coach) pair;
-- status changes (canceled, reactivated, plan-changed) update the same row.
--
-- Idempotent via DO block so reruns are no-ops.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_subscriptions_client_coach_unique'
      AND conrelid = 'public.client_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_client_coach_unique
      UNIQUE (client_id, coach_id);
  END IF;
END $$;
