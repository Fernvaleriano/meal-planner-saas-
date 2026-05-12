-- Migration 007: Track when a coach has acknowledged the dispute / chargeback
-- disclosure. We block the billing dashboard with a modal until they tap
-- "I understand" so they can't claim later they weren't told.
--
-- Nullable: existing coaches see the modal on next visit; new coaches see
-- it on first visit after Stripe Connect onboarding completes.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS dispute_disclosure_acknowledged_at TIMESTAMPTZ;
