-- 011: Security hardening — provably-safe batch (no app code references these).
-- Applied to production 2026-05-18. Reversible (DISABLE RLS / re-GRANT).
--
-- (1) ERROR-level (Supabase advisor): 4 stale backup tables had NO row-level
-- security, exposing real workout/client data via the public anon key.
-- Enabling RLS with NO policy denies anon/authenticated entirely; the
-- service role is unaffected and nothing in the app queries these tables.
ALTER TABLE public.bkp_20260516_client_workout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_20260516_exercise_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_20260516_workout_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_20260516_workout_programs         ENABLE ROW LEVEL SECURITY;

-- (2) Privilege hole: enable_gym_features_for_email() is SECURITY DEFINER and
-- was callable by anon/authenticated via the public REST API. Admin/manual
-- function only — not called by app code. (See 012 for the complete fix:
-- 011's REVOKE was insufficient because EXECUTE was granted to PUBLIC.)
REVOKE EXECUTE ON FUNCTION public.enable_gym_features_for_email(text) FROM anon, authenticated;
