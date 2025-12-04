-- Fix: Allow clients to view their coach's basic info (name, email)
-- Without this, the client settings page shows "Loading..." for coach name
-- because RLS blocks clients from reading the coaches table

-- Add policy to allow clients to view their own coach
CREATE POLICY "Clients can view their coach"
ON coaches
FOR SELECT
TO authenticated
USING (
    id IN (SELECT coach_id FROM clients WHERE user_id = auth.uid())
);
