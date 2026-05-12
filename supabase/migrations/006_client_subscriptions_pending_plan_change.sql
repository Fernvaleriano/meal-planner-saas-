-- Migration 006: Support deferred plan downgrades via Stripe Subscription Schedules.
--
-- When a client downgrades (or swaps to a same-priced plan), we want the
-- new plan to take effect at the END of the current billing period rather
-- than immediately — so the client keeps the access they already paid for.
-- Upgrades remain immediate (charged for the prorated difference at the
-- moment of upgrade, see proration_behavior: 'always_invoice').
--
-- We track the pending change in three new columns:
--   pending_plan_id            — the plan the subscription will switch to
--   pending_change_effective_at — when the switch will happen (period end)
--   stripe_schedule_id          — the Stripe schedule that orchestrates it
--
-- When Stripe fires the price-swap event at period end, the webhook
-- handler promotes pending_plan_id → plan_id and clears these columns.
--
-- Idempotent.

ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id UUID REFERENCES public.coach_payment_plans(id),
  ADD COLUMN IF NOT EXISTS pending_change_effective_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_schedule_id TEXT;

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_schedule
  ON public.client_subscriptions(stripe_schedule_id)
  WHERE stripe_schedule_id IS NOT NULL;
