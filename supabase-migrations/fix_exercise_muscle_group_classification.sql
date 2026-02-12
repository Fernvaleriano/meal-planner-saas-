-- Migration: Fix exercise muscle_group misclassification
--
-- BUG: The import script checked "bicep" before "hamstring"/"glute"/"quadricep",
-- so exercises with scientific muscle names like "Biceps Femoris" (a hamstring)
-- or "Triceps Surae" (a calf) were incorrectly categorized as "arms".
--
-- This migration corrects muscle_group for all affected exercises by checking
-- the primary_muscles text for leg keywords first, matching the fixed import logic.

-- ==============================================
-- FIX: Exercises with leg muscles misclassified as "arms"
-- ==============================================

-- Exercises whose primary_muscles contain quadricep/hamstring/glute/calf
-- keywords but were wrongly stored as "arms" due to scientific names
-- like "Biceps Femoris" (hamstring) or "Triceps Surae" (calf)

UPDATE exercises
SET muscle_group = 'legs'
WHERE muscle_group = 'arms'
  AND (
    LOWER(primary_muscles) LIKE '%quadricep%'
    OR LOWER(primary_muscles) LIKE '%hamstring%'
    OR LOWER(primary_muscles) LIKE '%glute%'
    OR LOWER(primary_muscles) LIKE '%calf%'
    OR LOWER(primary_muscles) LIKE '%calves%'
  );

-- ==============================================
-- FIX: Exercises with back muscles misclassified
-- ==============================================

-- Catch any back exercises that might have been misclassified
-- (e.g. if primary_muscles mentions "back" or "latissimus" but
-- was caught by an earlier wrong keyword)
UPDATE exercises
SET muscle_group = 'back'
WHERE muscle_group NOT IN ('back', 'legs', 'chest', 'shoulders', 'core')
  AND (
    LOWER(primary_muscles) LIKE '%latissimus%'
    OR LOWER(primary_muscles) LIKE '%rhomboid%'
    OR LOWER(primary_muscles) LIKE '%trapezius%'
  )
  AND LOWER(primary_muscles) NOT LIKE '%quadricep%'
  AND LOWER(primary_muscles) NOT LIKE '%hamstring%'
  AND LOWER(primary_muscles) NOT LIKE '%glute%';

-- ==============================================
-- VERIFY: Log affected exercises (for manual review)
-- ==============================================
-- Run this SELECT to see what was fixed:
-- SELECT name, muscle_group, primary_muscles
-- FROM exercises
-- WHERE primary_muscles IS NOT NULL
--   AND (LOWER(primary_muscles) LIKE '%biceps femoris%'
--        OR LOWER(primary_muscles) LIKE '%triceps surae%')
-- ORDER BY name;
