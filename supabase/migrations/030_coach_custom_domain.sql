-- 030: Optional custom domain per coach (white-label domains)
--
-- A branded coach can get their own domain (e.g. app.huracanfitness.app)
-- so members never see ziquecoach.com. The domain is stored lowercase,
-- host only (no scheme, no path). Resolution paths that use it:
--   - get-coach-branding?domain=<host>       (SPA pre-login branding)
--   - dynamic-manifest / coach-icon           (Host-header fallback)
--   - client-bound emails                     (links use the coach domain)
--   - gym-login /gym/<slug>                   (redirects to the coach domain)
-- Ops steps per domain (Netlify alias + Supabase auth allowlist) are in
-- CUSTOM-DOMAINS.md.

alter table public.coaches add column if not exists custom_domain text;
create unique index if not exists coaches_custom_domain_key
  on public.coaches (custom_domain);
