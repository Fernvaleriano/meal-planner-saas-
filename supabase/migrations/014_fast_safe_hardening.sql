-- 014: Two verified-safe fast hardening fixes. Applied to prod & verified
-- 2026-05-18 (anon/auth exec = false, service_role = true; shared_workout
-- _programs left with SELECT public-read + INSERT create only).
--
-- (a) Dropped "Anyone can update shared workout programs" (UPDATE USING
-- true) — anyone could modify any shared program. No frontend touches
-- this table directly; updates go via the service-key save-shared-workout
-- .js (bypasses RLS). SELECT (public share read, used by export-my-data)
-- and INSERT (share creation) intentionally left intact.
DROP POLICY IF EXISTS "Anyone can update shared workout programs" ON public.shared_workout_programs;

-- (b) check_workout_log_constraints(): SECURITY DEFINER, was anon/
-- authenticated-callable via public REST. Only caller is workout-logs.js
-- which runs as the service role. Locked to server/admin roles.
REVOKE EXECUTE ON FUNCTION public.check_workout_log_constraints() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_workout_log_constraints() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_workout_log_constraints() TO postgres, service_role;
