-- Migration 009: Append-only audit log for sensitive actions (GDPR Phase 1).
--
-- ADDITIVE ONLY. This migration creates ONE new table plus its indexes and
-- RLS policies. It does NOT alter, drop, or touch any existing table, so
-- reverting it (DROP TABLE public.audit_log) cannot break existing features.
--
-- Logged actions are limited to sensitive events (data export, account
-- deletion requests, role/permission changes, billing changes, login).
-- High-volume / non-sensitive activity is intentionally NOT logged here.
--
-- Retention: a 12-month retention policy is documented in privacy.html.
-- Enforcement (a scheduled purge) is intentionally deferred to a later
-- phase to keep this migration minimal and side-effect free.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     UUID NOT NULL,          -- auth.users.id of who performed the action
  tenant_id    UUID,                   -- owning coach (coaches.id) for tenant scoping; NULL for self/system
  action       TEXT NOT NULL,          -- e.g. 'data_export', 'account_deletion_requested', 'login'
  target_type  TEXT,
  target_id    TEXT,
  ip           TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON public.audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON public.audit_log (action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT: an authenticated user may only write rows where THEY are the
-- actor. This lets functions append audit entries under the caller's JWT
-- (no service-role needed for the data path).
DROP POLICY IF EXISTS audit_log_insert_own ON public.audit_log;
CREATE POLICY audit_log_insert_own
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- SELECT: a user sees their own actions; a coach additionally sees actions
-- scoped to their tenant (coaches.id == auth.users.id is the verified
-- convention in this codebase — see cancel-subscription.js).
DROP POLICY IF EXISTS audit_log_select_own ON public.audit_log;
CREATE POLICY audit_log_select_own
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid()
    OR tenant_id = auth.uid()
  );

-- APPEND-ONLY BY DESIGN: no UPDATE or DELETE policy is defined. Under RLS,
-- the absence of a policy means UPDATE/DELETE is denied for the
-- `authenticated` role. The service role (admin tooling, retention jobs)
-- bypasses RLS and remains the only path that can mutate/prune this table.

COMMENT ON TABLE public.audit_log IS
  'Append-only audit trail for sensitive actions (GDPR Phase 1). No UPDATE/DELETE by design. 12-month retention documented in privacy.html.';
