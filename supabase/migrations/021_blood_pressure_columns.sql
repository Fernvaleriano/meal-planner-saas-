-- Migration 021: Restore blood-pressure columns on client_measurements.
--
-- The app has long written blood pressure into these columns:
--   • save-measurement.js inserts blood_pressure_systolic / _diastolic
--   • src/pages/Progress.jsx sends bloodPressureSystolic / Diastolic
-- ...but the columns were never present in production, so any save that
-- included BP keys failed. This recreates them (they exist in the archived
-- supabase-migrations/client_measurements.sql but never made it to prod).
--
-- Both nullable/additive — existing rows and every existing insert path keep
-- working unchanged.

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS blood_pressure_systolic NUMERIC(5,1);

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS blood_pressure_diastolic NUMERIC(5,1);
