# supabase/migrations — CANONICAL migration path

This is the **single source of truth** for schema migrations going forward.

## ⚠️ KNOWN ISSUE: no baseline (DB is not reproducible from zero)

These files are **incremental patches only**. None of them create the
foundational tables (`clients`, `coaches`, and ~70 others). Production
has **74 tables, 10 functions, 199 RLS policies**; the migration files
create almost none of that base — it was created by hand in the Supabase
dashboard early on and never captured in version control.

Consequence: a fresh database replaying these migrations FAILS (verified
May 2026 — a fresh Supabase branch came up with ~1 table and
`MIGRATIONS_FAILED`). This is a disaster-recovery / staging / security-
audit risk, NOT a production problem (prod is healthy).

## The fix (see /DB-RECOVERY-RUNBOOK.md)

1. Capture production's current schema as `000_baseline.sql` using
   `pg_dump`/Supabase CLI (must be a real dump for fidelity — do NOT
   hand-reconstruct).
2. Treat `000_baseline.sql` as the new starting point; `001`–`010` are
   already represented in it (they were applied to prod long ago).
3. Every future change = one new numbered file on top of the baseline.

## Going-forward rule

- New schema change → add ONE new numbered file here (e.g. `011_*.sql`).
- Apply via `supabase` CLI or the MCP `apply_migration`.
- Do NOT add SQL to `../supabase-migrations/` (archived — see its README).
