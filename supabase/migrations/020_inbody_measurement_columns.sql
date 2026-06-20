-- Migration 020: InBody scan auto-log support.
--
-- The InBody body-composition printout reports four headline numbers, but two
-- of them previously had nowhere to live in client_measurements:
--   • Skeletal Muscle Mass
--   • Visceral Fat Level
-- (weight and body fat % already had columns.)
--
-- This adds those two columns so the InBody-scan reader can auto-log them.
-- Both are nullable and additive — existing rows and every existing insert
-- path keep working unchanged.
--
-- Units:
--   skeletal_muscle_mass — stored in the SAME unit as `weight` (lbs or kg),
--                          governed by the row's `weight_unit`.
--   visceral_fat_level   — InBody visceral fat LEVEL (a unitless number,
--                          typically 1-20). Not the cm² area.

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS skeletal_muscle_mass NUMERIC(5,1);

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS visceral_fat_level NUMERIC(4,1);
