-- Migration to add preferred exercise gender for workout demonstrations
-- This allows clients to choose whether they see male or female exercise demonstrations

-- Add the preferred_exercise_gender column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS preferred_exercise_gender VARCHAR(20) DEFAULT 'all';

-- Add a comment explaining the column
COMMENT ON COLUMN clients.preferred_exercise_gender IS 'Preferred gender for exercise demonstrations: male, female, or all (show all variants)';

-- Note: The exercises table already has a gender_variant column (VARCHAR(10))
-- Values can be: 'male', 'female', or NULL (for unisex/gender-neutral exercises)
