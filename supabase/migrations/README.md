# supabase/migrations — CANONICAL migration path

This is the **single source of truth** for schema migrations going forward.

## ✅ BASELINE CAPTURED (May 2026)

`000_baseline.sql` is a faithful snapshot of the **entire production
schema**, generated directly from prod using Postgres's own definition
functions (`pg_get_constraintdef`, `pg_get_indexdef`,
`pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_viewdef`,
`pg_get_expr`, `format_type`). Structurally verified to match prod
object-for-object: 74 tables, 57 sequences, 233 constraints, 156
explicit indexes, 10 functions, 1 view, 15 triggers, 199 RLS policies.

This solves the previous "no baseline / not reproducible from zero"
problem (the historical migration files are only incremental patches and
never created the base tables — verified May 2026 when a fresh Supabase
branch came up with ~1 table / `MIGRATIONS_FAILED`).

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
