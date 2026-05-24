-- Migration 015: Drop leftover overpermissive policies on public.exercises.
--
-- Background: the exercises table had four correctly-scoped policies
--   - "Anyone can view global exercises"      (SELECT, coach_id IS NULL OR own)
--   - "Coaches can create custom exercises"   (INSERT, own coach_id AND is_custom)
--   - "Coaches can update own exercises"      (UPDATE, own coach_id)
--   - "Coaches can delete own exercises"      (DELETE, own coach_id)
-- alongside two legacy wide-open policies that let any anonymous caller
-- INSERT or UPDATE any row. The Supabase security linter flagged both as
-- rls_policy_always_true. Dropping them does not remove any legitimate
-- write path:
--   * Backend writes (scripts/, netlify/functions/) run under service_role
--     and bypass RLS regardless.
--   * Coach-initiated custom-exercise creation is covered by the scoped
--     "Coaches can create custom exercises" policy.
--   * Read access (used by client React app and coach pages) is unchanged.

DROP POLICY IF EXISTS "Allow public insert on exercises" ON public.exercises;
DROP POLICY IF EXISTS "Allow public update on exercises" ON public.exercises;
