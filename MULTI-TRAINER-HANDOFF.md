# Multi-Trainer Gyms — Build Status & Handoff

**Goal:** let one gym account (e.g. Huracan) have multiple trainers, each with
their own login, where each trainer coaches only the clients assigned to them,
and the gym owner sees everyone.

**Guiding safety model — "first, do no harm":**
- `clients.coach_id` **never changes.** It always points at the gym owner. Every
  existing query that filters by `coach_id` keeps working, so the owner keeps
  seeing all clients exactly as today.
- The **only** new ownership layer is the nullable `clients.trainer_id`.
  `NULL` = handled by the owner directly (every existing client; stays default).
- Everything is gated by `coach_settings.multi_trainer_enabled` (default
  `false`). Flag off ⇒ the product behaves identically to before. The founder
  currently has **no other coaches**, so blast radius is minimal — but keep the
  flag discipline anyway.

---

## ✅ DONE (Phase 1 — committed on branch `claude/gym-coach-workout-assign-u19r2c`)

1. **DB migration** — `supabase-migrations/multi_trainer.sql`
   - `gym_trainers` table (gym_coach_id, trainer_user_id, email, name, role,
     status, can_create_clients).
   - `clients.trainer_id` nullable FK → `gym_trainers(id)` `ON DELETE SET NULL`.
   - `coach_settings.multi_trainer_enabled` boolean default false.
   - RLS + updated_at trigger + `enable_multi_trainer_for_email(email)` helper.
   - ⚠️ **NOT YET APPLIED TO THE LIVE DB** — the apply needed an approval this
     session couldn't grant. **First step for whoever continues:** apply it
     (Supabase MCP `apply_migration` on project `qewqcjzlfqamqwbccapr`, or paste
     the SQL into the Supabase SQL editor). It's purely additive and safe.
   - Then enable it for the founder:
     `SELECT enable_multi_trainer_for_email('contact@ziquefitness.com');`
     (The API also treats the two founder emails as beta-enabled as a fallback.)

2. **Auth helper** — `netlify/functions/utils/auth.js`
   - `resolveGymContext(event)` → `{ user, role, gymCoachId, trainerId, trainer }`.
     - `role:'owner'` for any login that has a `coaches` row (every normal coach;
       `gymCoachId = self`, `trainerId = null` — unchanged behavior).
     - `role:'trainer'` for an active `gym_trainers` row (`gymCoachId` = the gym
       owner, `trainerId` scopes to their clients).
   - `authenticateGymMember(event, gymCoachId)` — allows owner OR that gym's
     trainer. **This is the building block for all trainer-facing scoping.**

3. **Backend API** — `netlify/functions/gym-trainers.js` (owner-only, flag-gated)
   - `GET  ?coachId=` → list trainers + client counts.
   - `GET  ?coachId=&resource=clients` → gym clients + current trainer_id.
   - `POST {action:'create', email, name, password?}` → make a trainer (creates
     their auth login; returns a temp password if none given; links an existing
     non-coach login if the email already exists).
   - `POST {action:'assign', clientId|clientIds, trainerId|null}` → set
     `clients.trainer_id` (never touches coach_id).
   - `PUT  {trainerId, name?/status?/canCreateClients?}` → update/disable/enable.
   - `DELETE ?trainerId=` → remove trainer (clients revert to owner via SET NULL).

4. **Owner UI** — `gym-trainers.html` (new coach page)
   - Login-guarded, owner-only. Add trainers, enable/disable/remove them, and a
     "who coaches whom" table to assign each client to a trainer or keep with the
     owner. Calls the API with the session bearer token.
   - **TODO wiring:** add a link to this page in the coach dashboard/sidebar nav
     (e.g. in `dashboard.html` and the shared coach nav). Not yet linked.

---

## ⏳ REMAINING (Phase 2 — the trainer-facing vertical slice)

This is the bigger, careful part: making a **trainer's login** actually work
end-to-end. The core problem: today every coach page and function assumes
`the logged-in user IS the coach` (`coach_id = session.user.id`). A trainer's
`user.id` is NOT the gym's `coach_id`, so that assumption must be replaced with
"resolve my gym context, then scope to my clients."

**Do this incrementally, flag-gated, and verify the owner path is byte-identical
at each step (owners must keep seeing everything).**

### 2a. Trainer login & session bootstrap
- A trainer logs in through the normal coach login (`login.html`) with their own
  email/password. On load, the coach pages currently do
  `supabaseClient.from('coaches').select().eq('id', user.id)` and bounce to
  login/subscription if missing. A trainer has **no coaches row**, so they'd get
  kicked out. Add a shared front-end helper (e.g. `js/gym-context.js`) that:
  - Calls a small new function `gym-context` (wrap `resolveGymContext`) returning
    `{ role, gymCoachId, trainerId, gymName, gymBranding }`.
  - Caches it and exposes `getEffectiveCoachId()` (= `gymCoachId`) and
    `getTrainerScope()` (= `trainerId` or null) to pages.
- Coach pages then use `getEffectiveCoachId()` instead of `session.user.id`, and
  skip the "no coaches row ⇒ redirect" bounce when `role==='trainer'`.
- Subscription check: a trainer inherits the gym owner's subscription — check the
  OWNER's status, not the trainer's.

### 2b. Client list scoping (`manage-clients.html` + its data source)
- When `role==='trainer'`, filter the client list to `trainer_id === myTrainerId`.
- Owner sees all (no filter) — unchanged.
- New clients a trainer creates must set `trainer_id = myTrainerId` AND
  `coach_id = gymCoachId`. Update `netlify/functions/create-client.js` to accept
  a trainer context (use `authenticateGymMember`, derive coach_id from the gym,
  set trainer_id when the caller is a trainer). Respect `can_create_clients`.
  Client limits still count against the **gym owner's** plan (already keyed by
  coach_id — good).

### 2c. Workout assignment scoping (`coach-workouts.html`, `coach-workout-plans.html`,
`netlify/functions/workout-assignments.js`)
- The "assign to clients" client picker must show only the trainer's clients when
  `role==='trainer'`. The GET `?coachId=` assignment list should be filterable by
  `trainerId` (join clients on trainer_id) so a trainer only sees their
  assignments. POST assignment: keep `coach_id = gymCoachId`; optionally verify
  the target client's `trainer_id` matches the caller when they're a trainer.
- Workout templates (`workout_programs`) are gym-owned (coach_id = gym). Decide:
  do trainers share the gym's template library (recommended, simplest) or get
  private ones? Phase 2 recommendation: **shared, read/assignable by all trainers;
  only the owner edits the library.**

### 2d. Everything else that filters by coach_id
Audit and scope (same pattern) as needed: `coach-messages.html`,
`coach-stats.html`, `client-profile.html`, `coach-challenges.html`, dashboards,
notifications. For each: owner unchanged; trainer scoped to their clients. Some
(stats/dashboard) may be fine to show gym-wide to trainers in v1 — decide per
page with the founder. **Messaging is the sensitive one** — a trainer should
only message their own clients.

### 2e. Branding & identity
- Clients see the gym's branding (already stored on the owner `coaches` row) —
  trainers should inherit it, not have their own. When a trainer coaches a
  client, the client experience is unchanged.

---

## Test plan for Phase 2 (before enabling on any real gym)
1. Owner login: confirm they still see ALL clients, workouts, stats — identical
   to before (the "revert scenario" test — if multi-trainer were removed, the
   owner path must be unchanged).
2. Create trainer A + trainer B under the gym. Assign client X to A, client Y to B.
3. Log in as A: sees only X, can assign a workout to X, cannot see Y or message Y.
4. Log in as B: sees only Y.
5. Disable trainer A: A can no longer log into gym context; client X still owned
   by owner and visible to owner.
6. Remove trainer B: client Y reverts to owner (trainer_id NULL), no data lost.
7. Flag OFF on a different test coach: multi-trainer completely invisible.

## Key files reference
- Migration: `supabase-migrations/multi_trainer.sql`
- Auth helpers: `netlify/functions/utils/auth.js`
  (`resolveGymContext`, `authenticateGymMember`)
- Trainer admin API: `netlify/functions/gym-trainers.js`
- Owner UI: `gym-trainers.html`
- The assumption to replace everywhere: `coach_id = session.user.id` →
  `getEffectiveCoachId()` + optional `trainerId` scope.
