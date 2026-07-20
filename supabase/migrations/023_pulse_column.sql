-- Migration 023: Add a dedicated pulse column to client_measurements.
--
-- Blood-pressure monitors report a pulse (bpm) alongside systolic/diastolic,
-- but there was no column for it, so pulse was previously stuffed into the
-- free-text notes field. This gives pulse its own home, mirroring the
-- blood-pressure columns added in migration 021.
--
-- Nullable/additive — existing rows and every existing insert path keep
-- working unchanged.

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS pulse NUMERIC(5,1);
