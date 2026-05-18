# supabase-migrations — ARCHIVED / HISTORICAL (do not use)

These 80 files are **historical, hand-run SQL scripts** that were
applied directly to production over time (out of order, including a
`*_ROLLBACK.sql` and various `fix_*` / `backfill_*` scripts). They are
**already baked into the production schema.**

## Status: FROZEN ARCHIVE

- **Do NOT add new files here.** New migrations go in
  `../supabase/migrations/` (the canonical path — see its README).
- **Do NOT replay these for a fresh build.** They are unordered and
  assume prod state; replaying them will not reproduce the database.
- Kept only for historical reference / git archaeology.

The real reproducibility fix is a production schema baseline — see
`/DB-RECOVERY-RUNBOOK.md` and `../supabase/migrations/README.md`.
