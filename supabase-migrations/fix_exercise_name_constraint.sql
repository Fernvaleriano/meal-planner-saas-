ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_name_unique;
CREATE UNIQUE INDEX exercises_name_gender_unique ON exercises(name, COALESCE(gender_variant, 'unisex'));
