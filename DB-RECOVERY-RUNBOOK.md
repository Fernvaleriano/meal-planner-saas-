# Database Recovery Runbook — capture a reproducible schema baseline

**Why:** the migration files do not create the base schema (clients,
coaches, ~70 tables). Production cannot currently be rebuilt from
version control. This runbook captures a faithful baseline so a fresh
database (DR, staging, security audit) can be rebuilt exactly.

**Production project ref:** `qewqcjzlfqamqwbccapr`
**Production scale (May 2026):** 74 tables, 10 functions, 199 RLS policies.

> ⚠️ This MUST be done with `pg_dump` / the Supabase CLI so it captures
> everything (function bodies, triggers, constraints, exact RLS
> expressions, defaults, sequences, grants). A hand-reconstructed
> schema is NOT acceptable for a recovery artifact — a subtly wrong
> recipe is worse than a known-missing one. Production is READ-ONLY in
> every step below; nothing here mutates prod.

## Step 1 — Prereqs (local machine with DB access)

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref qewqcjzlfqamqwbccapr
```

## Step 2 — Capture the baseline (schema only, READ-ONLY on prod)

```bash
supabase db dump --linked --schema public -f supabase/migrations/000_baseline.sql
# (equivalently, with the DB connection string:)
# pg_dump --schema-only --no-owner --no-privileges "$PROD_DB_URL" \
#   > supabase/migrations/000_baseline.sql
```

Sanity-check the file: it should contain `CREATE TABLE ... clients`,
`CREATE TABLE ... coaches`, plus the RLS policies and functions.

## Step 3 — Reconcile history

- `000_baseline.sql` is now the starting point.
- `001`–`010` are ALREADY represented in the baseline (they were applied
  to prod long ago). For fresh builds you want **baseline only**, then
  future changes as `011_*`, `012_*`, …
- Move `001`–`010` into an `applied/` archive subfolder (or mark them
  applied in `supabase_migrations.schema_migrations`) so a fresh
  `supabase db reset` does not try to re-run them on top of the baseline.
- `supabase-migrations/` stays archived (see its README).

## Step 4 — Validate (throwaway environment, never prod)

```bash
supabase db reset            # local: rebuilds from 000_baseline only
# OR create a temporary Supabase branch, apply baseline, then:
supabase db diff --linked    # MUST report: no schema differences vs prod
```

Acceptance: a fresh DB reaches a schema that diffs CLEAN against
production. Delete any throwaway branch afterwards.

## Step 5 — Record done

- Update `supabase/migrations/README.md` (remove the "no baseline"
  warning once 000_baseline exists and validates).
- Remove the corresponding reminder from `CLAUDE.md`.
