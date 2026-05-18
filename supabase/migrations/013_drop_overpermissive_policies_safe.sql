-- 013: Drop two over-permissive RLS policies. Applied to production &
-- verified 2026-05-18. Both were safe (no frontend code uses these tables;
-- service_role bypasses RLS so server functions are unaffected).
--
-- coach_exercise_references already has correct coach-scoped
-- SELECT/INSERT/UPDATE/DELETE policies (coach_id = auth.uid()). The
-- "Service role full access" ALL-true policy OR-overrode them, exposing
-- every coach's references to anon/authenticated. Post-drop: 4 correct
-- coach-scoped policies remain.
DROP POLICY IF EXISTS "Service role full access to exercise references" ON public.coach_exercise_references;

-- contact_submissions: keep "Allow anonymous inserts" (public contact form);
-- drop "Allow authenticated reads" which let ANY logged-in user read ALL
-- submissions (PII). Post-drop: only the anon INSERT policy remains.
DROP POLICY IF EXISTS "Allow authenticated reads" ON public.contact_submissions;
