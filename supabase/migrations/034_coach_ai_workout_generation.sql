-- Migration: per-coach toggle for AI workout generation
-- ============================================================================
-- Adds a single boolean, `coaches.ai_workout_generation_enabled`. When TRUE
-- (the default) the coach sees the "AI Generate" / "Bulk AI" buttons in the
-- Workout Builder exactly as today. When FALSE, those AI entry points are
-- hidden and the coach builds every workout by hand — used for coaching-led
-- / gym accounts (e.g. Goliath) that intentionally don't want AI-generated
-- programs.
--
-- SAFETY: purely additive, default TRUE. Every existing coach keeps AI
-- generation exactly as before and sees no change. Reverting this column
-- (or the front-end gate that reads it) simply shows the AI buttons to
-- everyone again — nothing breaks.
-- ============================================================================

ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS ai_workout_generation_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN coaches.ai_workout_generation_enabled IS
    'When false, the AI workout generation buttons are hidden in the coach '
    'Workout Builder and this account builds workouts manually. Default true.';
