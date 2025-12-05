-- Fix progress_photos coach_id foreign key reference
-- The coach_id was incorrectly referencing coaches(id) instead of auth.users(id)
-- This caused foreign key violations when clients tried to upload photos

-- Step 1: Drop the existing foreign key constraint (if it exists)
DO $$
BEGIN
    -- Try to drop the constraint - different possible names
    BEGIN
        ALTER TABLE progress_photos DROP CONSTRAINT IF EXISTS progress_photos_coach_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        -- Constraint might not exist or have different name
        NULL;
    END;

    BEGIN
        ALTER TABLE progress_photos DROP CONSTRAINT IF EXISTS fk_progress_photos_coach_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- Step 2: Add the correct foreign key constraint referencing auth.users(id)
-- Using IF NOT EXISTS pattern with DO block
DO $$
BEGIN
    -- Check if the constraint already references auth.users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'progress_photos'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'coach_id'
        AND ccu.table_schema = 'auth'
    ) THEN
        ALTER TABLE progress_photos
        ADD CONSTRAINT progress_photos_coach_id_fkey
        FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If adding constraint fails (e.g., orphaned records), log and continue
    RAISE NOTICE 'Could not add constraint: %', SQLERRM;
END $$;

-- Verify the fix was applied
DO $$
DECLARE
    fk_table TEXT;
BEGIN
    SELECT ccu.table_schema || '.' || ccu.table_name INTO fk_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'progress_photos'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.column_name = 'coach_id'
    LIMIT 1;

    RAISE NOTICE 'progress_photos.coach_id now references: %', COALESCE(fk_table, 'NO CONSTRAINT FOUND');
END $$;
