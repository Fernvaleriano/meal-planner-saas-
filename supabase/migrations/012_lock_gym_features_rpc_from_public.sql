-- 012: Properly lock enable_gym_features_for_email() from public REST access.
-- Applied to production 2026-05-18.
--
-- 011's REVOKE FROM anon/authenticated was insufficient because EXECUTE was
-- granted to PUBLIC (Postgres default for functions). Revoke from PUBLIC and
-- re-grant only to server-side/admin roles. The master account's manual/admin
-- usage (run as postgres/service_role) keeps working; anon/authenticated can
-- no longer call it via the public API.
-- Verified post-apply: anon=NO, authenticated=NO, service_role=YES.
REVOKE EXECUTE ON FUNCTION public.enable_gym_features_for_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enable_gym_features_for_email(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enable_gym_features_for_email(text) TO postgres, service_role;
