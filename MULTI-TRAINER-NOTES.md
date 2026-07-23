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

**Built July 2026 (this completes the planned scope):**
- **Per-trainer permissions layer.** `gym_trainers.permissions` (jsonb) +
  `client_cap` (int). Keys: `build_workouts`, `write_meal_plans`,
  `message_clients`, `see_contact_info`; `can_create_clients` stays its own
  column. Convention everywhere: **absent key = allowed** (`trainerCan()` in
  `utils/auth.js`), so pre-layer trainers keep all abilities. Owner UI: the
  per-trainer "Permissions" panel in `gym-trainers.html`. Server gates: all
  coach_meal_plans writes, workout-programs + workout-assignments writes,
  chat send/bulk-send + diary comments (reading never gated), contact-info
  stripping in get-clients/trainer-clients, can_create_clients on BOTH create
  paths, per-trainer client cap on both create paths.
- **coach-profile.html** — trainers get a minimal profile (password change,
  preferences); owner-only cards hidden.
- **manage-recipes.html** — trainers browse the gym's library READ-ONLY
  (RLS `"Trainers can view gym recipes"`); writes stay owner-only.
- **client-feed.html** — scoped to assigned clients via coach-activity-feed
  (which now REQUIRES gym-member auth — it used to be open); reactions and
  comments allowed on assigned clients only.
- **Ghost-login cleanup** (risk #2): removing a trainer deletes their auth
  login when it's a pure trainer account (no coaches/clients/other-gym rows).

**Known limitation of `see_contact_info` (accepted July 2026):** the toggle is
enforced at the API layer (get-clients, trainer-clients, coach-activity-feed).
The trainer READ RLS policy on `clients` is full-row, so a technically savvy
blocked trainer could still read email/phone via a direct table query.
Column-level hiding needs a view or column grants — revisit if this toggle
ever needs to be watertight rather than UI-level.

**form-responses stays owner-only ON PURPOSE:** rows are lead-gen submissions
(UTM/referrer metadata, no client linkage), so they cannot be scoped to a
trainer's clients. Revisit only if form_responses ever gains a client_id.

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
