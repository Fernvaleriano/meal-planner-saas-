-- ============================================================================
-- ROLLBACK for normalize_workout_weights_to_kg.sql
-- Run the section matching the furthest phase you reached, in reverse order.
-- ============================================================================

-- ---- Rollback PHASE 2 (restore JSONB + aggregates from Phase 0 backups) ----
BEGIN;
UPDATE exercise_logs el
   SET sets_data    = b.sets_data,
       max_weight   = b.max_weight,
       total_volume = b.total_volume,
       weight_unit  = NULL,
       units_normalized = false
  FROM bkp_20260516_exercise_logs b
 WHERE b.id = el.id;

UPDATE workout_logs wl
   SET total_volume = b.total_volume
  FROM bkp_20260516_workout_logs b
 WHERE b.id = wl.id;

UPDATE workout_programs p
   SET program_data = b.program_data,
       units_normalized = false
  FROM bkp_20260516_workout_programs b
 WHERE b.id = p.id;

UPDATE client_workout_assignments a
   SET workout_data = b.workout_data,
       units_normalized = false
  FROM bkp_20260516_client_workout_assignments b
 WHERE b.id = a.id;
COMMIT;

-- ---- Rollback PHASE 1 (drop additive columns) ------------------------------
ALTER TABLE exercise_logs              DROP COLUMN IF EXISTS weight_unit;
ALTER TABLE exercise_logs              DROP COLUMN IF EXISTS units_normalized;
ALTER TABLE workout_programs           DROP COLUMN IF EXISTS units_normalized;
ALTER TABLE client_workout_assignments DROP COLUMN IF EXISTS units_normalized;

DROP FUNCTION IF EXISTS _zq_normalize_program(jsonb, text);
DROP FUNCTION IF EXISTS _zq_normalize_sets(jsonb, text);
DROP FUNCTION IF EXISTS _zq_to_kg(numeric, text);
DROP FUNCTION IF EXISTS _zq_norm_unit(text, text);

-- ---- Rollback PHASE 0 (only once fully reverted & verified) ----------------
-- DROP TABLE IF EXISTS bkp_20260516_exercise_logs;
-- DROP TABLE IF EXISTS bkp_20260516_workout_logs;
-- DROP TABLE IF EXISTS bkp_20260516_client_workout_assignments;
-- DROP TABLE IF EXISTS bkp_20260516_workout_programs;
