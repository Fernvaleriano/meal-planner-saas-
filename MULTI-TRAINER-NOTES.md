# Multi-Trainer ("gym owns, trainer borrows") — build notes & risk log

Started July 2026. This is the feature where a **gym owner** can add
**trainers** (personal trainers / sub-coaches) under their account. Each
trainer logs in and coaches a slice of the gym's clients.

## The model (LOCKED — do not drift from this)

**The gym owns every client. A trainer only borrows the ones assigned to them.**

- A client row: `coach_id` = the gym owner (ownership, never moves),
  `trainer_id` = the trainer it's assigned to (visibility/scoping).
- A trainer adding a client → that client is `coach_id` = gym,
  `trainer_id` = that trainer. The trainer can never own a client, so a
  departing trainer can't take clients with them.
- A trainer is a login (`auth.users`) with a `gym_trainers` row and **no
  `coaches` row**. That's how the app tells trainer from owner.

Who-is-who is resolved server-side by `resolveGymContext()` in
`netlify/functions/utils/auth.js`:
- has a `coaches` row → **owner** (`gymCoachId` = self, `trainerId` = null)
- else active `gym_trainers` row → **trainer** (`gymCoachId` = their gym,
  `trainerId` = theirs)

## What's built so far (trainers now use the REAL coach app)

The model shifted from "isolated trainer pages" to **"a trainer logs into the
same coach app the gym owner sees, branded as the gym, scoped to their
assigned clients."** `trainer-dashboard.html` is legacy; trainers now land on
`dashboard.html` itself.

- **`js/gym-context.js`** — `resolveCoachContext()` tells owner vs trainer.
  For trainers ONLY it installs a `fetch` shim that attaches the trainer's
  bearer token to same-origin `/.netlify/functions/*` calls that lack one, so
  the server-side scoping below actually engages. Owners never install it.
- **`netlify/functions/utils/auth.js`** — `resolveGymContext`,
  `authenticateGymMember(event, gymCoachId)` (owner OR that gym's trainer),
  and `trainerClientIdScope(event, supabase, coachId, knownCtx)` → null for
  owners/no-token (unchanged), else the trainer's assigned client-id array
  (fail-closed; gym derived from the TOKEN, never the request).
- **`dashboard.html`** — a trainer gets the full dashboard (AI ask bar, the
  three overview cards, stat chips, activity feed) via `loadTrainerHome`,
  which drives the normal loaders with the GYM's coach id and hides
  owner-only widgets (Stories/Pep Talks, onboarding, subscription/tier,
  gym-info editor). Owners return before this path — flow untouched.
- **Converted coach pages** (trainer shim + in `coach-layout.js`
  `TRAINER_NAV_ALLOW`): manage-clients, coach-messages, coach-challenges,
  supplement-protocols, coach-stats, coach-meal-plans, planner,
  coach-workouts, coach-workout-plans, client-profile.
- **Server functions scoped** via `trainerClientIdScope` (owner-safe/dormant):
  trainer-clients, create-client, chat, get-dashboard-stats,
  coach-activity-feed, coach-workout-feed, get-clients, the client CRUD set,
  the coach-meal-plan set, the client-profile write set (publish-plan,
  rename-plan, replace-demo-photo, respond-checkin,
  send-client-password-reset, save-gym-proof, save-weight-proof,
  upload-progress-photo, toggle-favorite, react-to-activity,
  reminder-settings), ai-activity-summary (both paths), programs-ending-soon.
- **Trainer READ RLS policies** (`"Trainers can view assigned clients ..."`,
  SELECT, scoped `coach_id = current_trainer_gym()` + `client_id IN (their
  assigned clients)`; `current_trainer_id()`/`current_trainer_gym()` are NULL
  for non-trainers so owners are unaffected) now cover: `clients`,
  `coach_meal_plans`, `client_checkins`, `client_measurements`,
  `client_workout_assignments`, `gym_proofs`, `progress_photos`,
  `workout_logs`, `exercise_logs`, `activity_comments`, `activity_reactions`,
  `chat_messages`. Tables WITHOUT a trainer policy (notifications,
  dismissed_activity_items, food_diary_entries, weight_logs, diary reactions/
  comments) return EMPTY for a trainer — safe (fail-closed), just not shown.

**Still to build:** trainer's own profile page (coach-profile hard-fails with
no coaches row), recipes (manage-recipes, coach-level RLS), client-feed,
form-responses. Plus a **per-trainer permissions layer**. Writes still need a
trainer UPDATE/DELETE path where editing is wanted (RLS is READ-only today).

## Design rules for every future slice

1. **SCOPE FIRST.** Every existing coach page assumes "owner sees
   everything." Before a trainer touches any screen (workouts, plans,
   messages, client profile), the data MUST be filtered to their assigned
   clients. Getting this wrong = a trainer sees the whole gym's roster.
   This is the #1 risk on this whole feature.
2. **Reads** can use RLS (add a trainer SELECT policy scoped to
   `trainer_id = current_trainer_id()`), **writes** should go through
   service-key functions using `resolveGymContext` (so we don't have to
   loosen RLS on every table). Keep this split consistent.
3. **Never trust client-supplied gym/trainer ids.** Always derive the gym
   and trainer from `resolveGymContext`, never from the request body. (A
   trainer forging `trainerId` is already blocked in `trainer-clients.js`.)
4. Don't edit owner pages in a way that changes behavior for existing
   coaches. Prefer isolated trainer pages / additive branches.

## Risk log (things that WILL bite us — watch for these)

1. **Client-list leakage (highest).** See rule #1. Any trainer screen that
   forgets to filter by `trainer_id` exposes the whole gym. Test every slice
   with a trainer who has SOME but not all clients assigned.
2. **Ghost logins on remove.** Removing a trainer (or a client who had a
   login) leaves the `auth.users` login behind → re-adding the same email
   later fails with "already used." Happened July 2026 with
   fernvalthai@gmail.com. Options: auto-clean the login on removal, or a
   friendlier "old account exists — reset it?" flow. Until then, an admin
   deletes the orphan `auth.users` row by hand.
3. **Shared client limit.** Every client a trainer adds counts against the
   GYM's plan cap (`create-client.js` / `trainer-clients.js` CLIENT_LIMITS).
   Several trainers can exhaust it fast, and they just see "gym is full."
   Consider per-trainer caps in the permissions layer.
4. **Disabled vs removed trainer.**
   - *Removed* (`gym_trainers` row deleted): clients' `trainer_id` → NULL via
     ON DELETE SET NULL. Clients revert to owner-only. Good.
   - *Disabled* (status != active): `current_trainer_id()` returns null, so
     the trainer sees nothing, but their clients keep `trainer_id` set. Owner
     still sees them (owner RLS ignores trainer_id). Re-enabling restores the
     trainer's view. No data lost, but keep this behavior in mind.
5. **Edit access lag.** Trainers can SELECT assigned clients but RLS does not
   yet allow trainer UPDATE/DELETE. When we build client-profile editing for
   trainers, open that deliberately (scoped), don't blanket-loosen it.
6. **Dual-role edge cases.** A user who is both a trainer and a client:
   `dashboard.html` checks client first → sends them to `/app`, never the
   trainer page. A trainer at two gyms: phase-1 blocks it
   (`TRAINER_ELSEWHERE`), and `resolveGymContext` uses `maybeSingle()` which
   would throw on multiple active rows — keep the one-gym invariant.
7. **PWA stale cache.** New pages can be served stale by the service worker.
   When testing a just-deployed trainer change, hard-refresh.
8. **Client-facing side (future).** When messages/plans reach the client,
   decide what the CLIENT sees — the gym brand, the trainer, or both — and
   scope the messages table accordingly.

## Permissions layer (requested July 2026, not built)

Let the gym owner decide, per trainer, what they can do. Start from
`gym_trainers.can_create_clients` (already exists and enforced) and grow:
build workouts, write meal plans, message clients, see client contact info,
per-trainer client cap. Build this sooner rather than later — retrofitting
permissions after trainers can already do everything is harder.
