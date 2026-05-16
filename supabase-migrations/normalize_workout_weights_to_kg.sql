-- ============================================================================
-- Normalize all workout weights to a canonical unit (KG)
-- ============================================================================
-- DO NOT run this whole file blindly. It is sequenced into phases.
-- Run Phase 0 + 1, then the Phase 2 DRY RUN, review the diff, and only
-- then run the Phase 2 ACTUAL block (inside the explicit transaction).
--
-- Canonical unit after migration: KG.  Constant: 0.45359237 (lbs -> kg).
-- Inference rule per set:
--   * trust set.weightUnit if present ('lb'/'lbs'/'pound' -> lbs, 'kg' -> kg)
--   * else for exercise_logs: client's CURRENT clients.unit_preference
--       ('metric' -> kg, 'imperial'/NULL -> lbs)
--   * else for workout_programs / client_workout_assignments (coach-authored):
--       'lbs' (coach builder dropdown default)
-- Known limitation: there is no historical record of the client's unit
-- preference at log time; current preference is used as best-effort.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PHASE 0: BACKUP  (run first; keep these tables until Phase 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bkp_20260516_workout_programs            AS SELECT * FROM workout_programs;
CREATE TABLE IF NOT EXISTS bkp_20260516_client_workout_assignments  AS SELECT * FROM client_workout_assignments;
CREATE TABLE IF NOT EXISTS bkp_20260516_workout_logs                AS SELECT * FROM workout_logs;
CREATE TABLE IF NOT EXISTS bkp_20260516_exercise_logs               AS SELECT * FROM exercise_logs;

-- ---------------------------------------------------------------------------
-- PHASE 1: ADD CANONICAL / AUDIT COLUMNS  (additive, non-breaking)
-- ---------------------------------------------------------------------------
ALTER TABLE exercise_logs              ADD COLUMN IF NOT EXISTS weight_unit       VARCHAR(3);
ALTER TABLE exercise_logs              ADD COLUMN IF NOT EXISTS units_normalized  BOOLEAN DEFAULT false;
ALTER TABLE workout_programs           ADD COLUMN IF NOT EXISTS units_normalized  BOOLEAN DEFAULT false;
ALTER TABLE client_workout_assignments ADD COLUMN IF NOT EXISTS units_normalized  BOOLEAN DEFAULT false;

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS (idempotent; safe to re-create)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _zq_norm_unit(u text, default_unit text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(u,'')) IN ('kg','kgs')                       THEN 'kg'
    WHEN lower(coalesce(u,'')) IN ('lb','lbs','pound','pounds')      THEN 'lbs'
    ELSE default_unit
  END;
$$;

CREATE OR REPLACE FUNCTION _zq_to_kg(val numeric, u text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN val IS NULL  THEN NULL
    WHEN u = 'kg'     THEN round(val, 1)
    ELSE round(val * 0.45359237, 1)
  END;
$$;

-- Normalize one JSONB array of sets to kg. Returns the (possibly unchanged)
-- array; preserves every other field and the original order.
CREATE OR REPLACE FUNCTION _zq_normalize_sets(sets jsonb, default_unit text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    (SELECT jsonb_agg(
       s
       || jsonb_build_object('weightUnit','kg')
       || CASE WHEN (s->>'weight') ~ '^-?[0-9]+(\.[0-9]+)?$'
               THEN jsonb_build_object('weight',
                      _zq_to_kg((s->>'weight')::numeric,
                                _zq_norm_unit(s->>'weightUnit', default_unit)))
               ELSE '{}'::jsonb END
       || CASE WHEN (s->>'prescribedWeight') ~ '^-?[0-9]+(\.[0-9]+)?$'
               THEN jsonb_build_object('prescribedWeight',
                      _zq_to_kg((s->>'prescribedWeight')::numeric,
                                _zq_norm_unit(s->>'weightUnit', default_unit)))
               ELSE '{}'::jsonb END
       ORDER BY ord)
     FROM jsonb_array_elements(sets) WITH ORDINALITY t(s, ord)),
    sets);
$$;

-- Walk program_data / workout_data: days[].exercises[].setsData[]
CREATE OR REPLACE FUNCTION _zq_normalize_program(pdata jsonb, default_unit text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN pdata ? 'days' THEN
    jsonb_set(pdata, '{days}', coalesce(
      (SELECT jsonb_agg(
         CASE WHEN day ? 'exercises' THEN
           jsonb_set(day, '{exercises}', coalesce(
             (SELECT jsonb_agg(
                CASE WHEN ex ? 'setsData'
                     THEN jsonb_set(ex, '{setsData}',
                            _zq_normalize_sets(ex->'setsData', default_unit))
                     ELSE ex END
                ORDER BY eo)
              FROM jsonb_array_elements(day->'exercises') WITH ORDINALITY e(ex, eo)),
             '[]'::jsonb))
         ELSE day END
         ORDER BY dord)
       FROM jsonb_array_elements(pdata->'days') WITH ORDINALITY d(day, dord)),
      '[]'::jsonb))
  ELSE pdata END;
$$;

-- ---------------------------------------------------------------------------
-- PHASE 2 -- DRY RUN  (NO WRITES). Review every row before executing actual.
-- ---------------------------------------------------------------------------
-- 2a. exercise_logs that would change
-- SELECT el.id, wl.client_id, c.unit_preference,
--        el.sets_data AS before,
--        _zq_normalize_sets(el.sets_data,
--          CASE WHEN c.unit_preference='metric' THEN 'kg' ELSE 'lbs' END) AS after
-- FROM exercise_logs el
-- JOIN workout_logs wl ON wl.id = el.workout_log_id
-- JOIN clients c       ON c.id  = wl.client_id
-- WHERE el.sets_data IS DISTINCT FROM
--       _zq_normalize_sets(el.sets_data,
--         CASE WHEN c.unit_preference='metric' THEN 'kg' ELSE 'lbs' END);
--
-- 2b. counts summary
-- SELECT count(*) AS exercise_logs_changed FROM exercise_logs el
-- JOIN workout_logs wl ON wl.id=el.workout_log_id JOIN clients c ON c.id=wl.client_id
-- WHERE el.sets_data IS DISTINCT FROM _zq_normalize_sets(el.sets_data,
--   CASE WHEN c.unit_preference='metric' THEN 'kg' ELSE 'lbs' END);
--
-- 2c. programs / assignments that would change
-- SELECT id FROM workout_programs
-- WHERE program_data IS DISTINCT FROM _zq_normalize_program(program_data,'lbs');
-- SELECT id FROM client_workout_assignments
-- WHERE workout_data IS DISTINCT FROM _zq_normalize_program(workout_data,'lbs');

-- ---------------------------------------------------------------------------
-- PHASE 2 -- ACTUAL  (run only after dry-run review; one transaction)
-- ---------------------------------------------------------------------------
-- BEGIN;
--
-- -- (i) coach-authored programs
-- UPDATE workout_programs
--    SET program_data = _zq_normalize_program(program_data, 'lbs'),
--        units_normalized = true
--  WHERE coalesce(units_normalized,false) = false;
--
-- UPDATE client_workout_assignments
--    SET workout_data = _zq_normalize_program(workout_data, 'lbs'),
--        units_normalized = true
--  WHERE coalesce(units_normalized,false) = false;
--
-- -- (ii) client exercise logs (sets_data + flags)
-- UPDATE exercise_logs el
--    SET sets_data = _zq_normalize_sets(
--          el.sets_data,
--          CASE WHEN c.unit_preference='metric' THEN 'kg' ELSE 'lbs' END),
--        weight_unit = 'kg',
--        units_normalized = true
--   FROM workout_logs wl
--   JOIN clients c ON c.id = wl.client_id
--  WHERE wl.id = el.workout_log_id
--    AND coalesce(el.units_normalized,false) = false;
--
-- -- (iii) recompute exercise_logs aggregates from normalized sets_data
-- UPDATE exercise_logs el
--    SET max_weight   = agg.mw,
--        total_volume = agg.tv
--   FROM (
--     SELECT e.id,
--            max((s->>'weight')::numeric) AS mw,
--            sum(coalesce((s->>'reps')::numeric,0)
--              * coalesce((s->>'weight')::numeric,0)) AS tv
--       FROM exercise_logs e,
--            jsonb_array_elements(e.sets_data) s
--      WHERE e.units_normalized = true
--        AND (s->>'weight') ~ '^-?[0-9]+(\.[0-9]+)?$'
--      GROUP BY e.id
--   ) agg
--  WHERE el.id = agg.id;
--
-- -- (iv) recompute workout_logs.total_volume from its exercise_logs
-- UPDATE workout_logs wl
--    SET total_volume = agg.tv
--   FROM (SELECT workout_log_id, sum(total_volume) AS tv
--           FROM exercise_logs GROUP BY workout_log_id) agg
--  WHERE wl.id = agg.workout_log_id;
--
-- -- review, then:  COMMIT;   (or  ROLLBACK;  to abort)

-- ---------------------------------------------------------------------------
-- ROLLBACK (per phase) -- see normalize_workout_weights_to_kg_ROLLBACK below
-- ---------------------------------------------------------------------------
