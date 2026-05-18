# Security — Remaining Hardening (pre-real-coach checklist)

Context: As of May 2026 there are **no real outside coaches** (only the
master account = founder, plus demo coaches), so none of the below leaks
real customers' data *today*. These must be done **before onboarding
real coaches**. Each needs per-item care — they are NOT safe to blanket
"lock to service_role" because some are read by features.

## DONE & VERIFIED (this pass)
- ✅ 4 `bkp_20260516_*` tables: RLS enabled (was ERROR-level open). (011)
- ✅ `enable_gym_features_for_email()` RPC: revoked from public/anon/
  authenticated; admin/server only. (011/012)
- ✅ `coach_exercise_references`: dropped the `true` ALL policy; correct
  coach-scoped policies remain. (013)
- ✅ `contact_submissions`: dropped "any authenticated can read all"
  (PII); anonymous-insert (contact form) kept. (013)
- ✅ `shared_workout_programs`: dropped "Anyone can update" (UPDATE
  USING true). SELECT/INSERT intact. (014)
- ✅ `check_workout_log_constraints()`: revoked public/anon/auth
  execute; service role (its only caller) unaffected. (014)
- Master account (`contact@ziquefitness.com`) unaffected — required.

## REMAINING — needs a focused session

1. **`personal_records`** — policy "Service can manage PRs" is `USING
   (true)` for ALL → any user can read/write all clients' PRs.
   ⚠️ Do NOT lock to service_role: `export-my-data.js` reads it via the
   user-scoped client. FIX = proper tenant-scoped policies (client sees
   own via `client_id` → `clients.user_id = auth.uid()`; coach sees own
   clients' PRs), like other client tables already do.
2. **`shared_workout_programs`** — "Anyone can update" UPDATE `true`
   (and INSERT `true`). Public share feature; also read by
   `export-my-data.js` (coach tables) via user client. At minimum drop
   the UPDATE-true; design INSERT/SELECT around the share flow
   (`get-shared-workout.js` / `save-shared-workout.js`).
3. **`exercises`** — "Allow public insert/update on exercises" `true`
   (global library tampering). Admin pages `sync-exercises.html` /
   `sync-thumbnails.html` use anon-key `.from('exercises')` — verify
   read vs write before removing; if they write via anon key, route
   through a service-key function or an admin-scoped policy instead of
   breaking the tool.
4. **Public storage buckets allow file LISTING** (Supabase advisor
   `0025`): progress-photos, weight-proofs, gym-proofs, chat-media,
   profile-photos, recipe-images, etc. Anyone can enumerate every
   file. FIX = remove the broad `SELECT`/list policy on
   `storage.objects` per bucket while keeping public object read (so
   images still load). Per-bucket care; pervasive image use.
   NOTE: `first-responder-ids` — explicitly **ignored** per founder.
5. **SECURITY DEFINER RPCs callable by anon/authenticated**:
   `check_workout_log_constraints()` (low — internal helper, can
   revoke). `get_my_coach_branding()` — **leave**: intentional, needed
   pre-auth for branded login.
6. **Likely-intentional public INSERTs** (review & accept, probably
   fine): `coaches.anon_insert_signup`, `form_responses` submit,
   `shared_meal_plans` insert, `meal_images` service insert.

## BIGGER, SEPARATE: Layer 2 (the real exposure surface)
Most of the app talks to the DB via Netlify functions using the
**service key (RLS bypassed)**, trusting `coachId`/`clientId` from the
request. Examples already seen trust request IDs without verifying the
caller owns them (e.g. `delete-measurement.js`, `client-daily-wins.js`).
A focused IDOR review of `netlify/functions/*` (does each verify the
authed user owns the coachId/clientId it acts on?) is the other half of
the multi-tenant audit and is where a real cross-coach leak would most
likely occur.

**CONFIRMED via spot-check (May 2026) — this is the #1 remaining real
issue, prioritize before real coaches:**
- GOOD (properly auth'd, do the right thing): `delete-client.js`,
  `archive-client.js` use `authenticateCoach(event, coachId)`.
- VULNERABLE pattern (service key + NO token/ownership check, act on
  request-supplied ids): `delete-measurement.js`,
  `delete-progress-photo.js`, `client-daily-wins.js`,
  `client-workout-log.js`, `coach-revenue.js` (financial data by
  coachId param, no auth), and almost certainly many more — this is a
  systemic pattern, not isolated. Anyone who knows the URL + an id can
  read/delete that data. Fix = add token verification + ownership check
  (mirror the `authenticateCoach` pattern) to every state-changing /
  data-returning function. Substantial, mechanical, do as a dedicated
  pass. Low real impact today (no real coaches) but a hard gate before
  onboarding.

## ADDITIONAL FINDINGS — second sweep (May 2026)

- ✅ FIXED: `.env` was not git-ignored (latent secret-leak footgun) —
  added `.env`, `.env.*`, `*.pem`, etc. to `.gitignore`.
- ✅ VERIFIED CLEAN: no real secrets committed (no service-role JWT, no
  Stripe/Resend/AI secret keys in tracked files). The 33 hardcoded keys
  are all the *public* anon key — fine by design, but sprawled (a
  maintenance smell, not a security issue).
- PERFORMANCE (Supabase advisor, 653 findings, all WARN/INFO — none
  ERROR; perf debt for scale, NOT urgent at ~10 users):
  395 multiple_permissive_policies, 181 auth_rls_initplan (use
  `(select auth.uid())` not `auth.uid()` in policies), 45 unused
  indexes, 25 unindexed FKs, 4 no-primary-key, 2 duplicate indexes.
  Address opportunistically / before heavy scale, not now.
