-- Fix: Allow clients to view their coach row for branding + coach display.
-- Without this, client-side branding fetches can return zero rows under RLS.
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'Clients can view their coach'
  ) THEN
    CREATE POLICY "Clients can view their coach"
    ON coaches
    FOR SELECT
    TO authenticated
    USING (
      id IN (SELECT coach_id FROM clients WHERE user_id = auth.uid())
    );
  END IF;
END $$;

-- Verification query
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'coaches'
  AND policyname = 'Clients can view their coach';
