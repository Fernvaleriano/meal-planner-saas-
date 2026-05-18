-- Migration 010: Account deletion state (GDPR Phase 2 — soft delete).
--
-- ADDITIVE ONLY. Adds nullable timestamp columns to clients and coaches.
-- No existing column/table is altered or dropped, so reverting (DROP the
-- columns) cannot break existing features. Nullable, no default → safe on
-- large tables (no table rewrite).
--
-- This is SOFT delete only. Rows are NOT removed by this migration or by
-- the request-account-deletion function. Permanent erasure ("hard purge")
-- is intentionally a separate, later, carefully-built step — nothing in
-- Phase 2 destroys data.
--
--   deletion_requested_at — when the user asked to delete (starts the
--                           30-day grace window; cancel via support)
--   deleted_at            — set at the same time; presence means the
--                           account is in the soft-deleted / locked state

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at
  ON public.clients (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coaches_deleted_at
  ON public.coaches (deleted_at) WHERE deleted_at IS NOT NULL;
