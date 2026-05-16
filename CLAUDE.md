# Project Memory

## HOLISTIC CODE MODIFICATION PROTOCOL (APPLIES TO EVERY CHANGE)

Primary directive: **"First, do no harm to the existing system."**

### 1. PRE-MODIFICATION ANALYSIS (MANDATORY)
Before any change:
- Identify ALL files, functions, and components that interact with the code being modified
- Map the dependency graph (callers and callees)
- List all data flows passing through this code
- Check for side effects (global state, DB writes, API calls, event emissions)
- Review existing tests covering affected areas

### 2. IMPACT ASSESSMENT (MANDATORY)
For every proposed fix, explicitly answer:
- What EXACTLY am I changing? (line-level precision)
- What ELSE does this change affect? (trace downstream effects)
- Could this break existing functionality? (list specific risks)
- Edge cases? (null values, boundaries, races, error states)
- Does this cascade into other modules/services?

### 3. THE "TWO-PROBLEM" CHECK
Assume your fix might create TWO new problems:
- One where the fixed code INTERFACES with other components
- One where assumptions in OTHER code relied on the OLD behavior
Hunt for these before finalizing.

### 4. REGRESSION SAFETY CHECKLIST
After implementing:
- Existing tests still pass
- No new warnings/errors
- API contracts unchanged (unless intentional)
- DB schemas/queries compatible
- No breaking changes to function signatures, return types, exceptions
- Performance not degraded
- Error handling still correct in all paths
- Logging/monitoring still functional

### 5. THE "REVERT SCENARIO" TEST
Ask: "If someone reverted ONLY my change, would the system break?"
- YES → unhealthy coupling, refactor
- NO → properly isolated

### 6. MINIMUM VIABLE CHANGE PRINCIPLE
- Smallest change that fixes the problem
- No unrelated refactors/optimizations in the same change
- Flag other issues separately
- Every line changed must be justifiable for this specific problem

### 7. BROADER SYSTEM VIEW
- End-to-end UX impact?
- Aligns with system architecture?
- Backward compatible?
- Works in dev/staging/production?
- Handles concurrent users/requests?
- Security implications considered?

### 8. EXPLICIT OUTPUT FORMAT
When proposing a fix:
- **PROBLEM IDENTIFIED:** clear bug description
- **AFFECTED COMPONENTS MAP:** files/functions/data flows
- **PROPOSED FIX:** code change with explanation
- **DOWNSTREAM IMPACT ANALYSIS:** direct effects, indirect effects, components at risk
- **VERIFICATION THAT NO NEW PROBLEMS INTRODUCED:** walkthrough proving each rule satisfied
- **TESTING RECOMMENDATIONS:** what to test, edge cases beyond the fixed scenario

**REMEMBER:** A fix that breaks something else is NOT a fix — it's a trade-off. When in doubt, BE CONSERVATIVE. Flag uncertainty rather than assume.

### CASE STUDY: Slow-success → fast-failure regressions
**Rule:** When a fix changes a failure mode from slow-success to fast-failure, audit ALL downstream error handlers that might misinterpret the new failure as "no data" instead of "error."

**The pattern (May 2026 workouts-disappearing bug):**
- A `getSession()` call that used to hang for 10–30s on iOS resume (slow but eventually returning a valid session) was wrapped in a 2.5s timeout race with a localStorage fallback. Correct fix for the hang.
- But the new failure path produced fast 401s — and downstream `.catch(() => null)` handlers in `Workouts.jsx` had been written assuming "null means no workouts," not "null means request failed." Result: state cleared, per-date cache poisoned with `[]`, workouts "disappeared" until cache was manually cleared.

**What to check whenever timeouts/races/fallbacks are added:**
1. Every `.catch(() => null)`, `.catch(() => [])`, `.catch(() => undefined)` downstream — does the caller distinguish error from empty?
2. Cache writes that happen unconditionally after a fetch — do they need to be gated on "no calls failed"?
3. UI state setters that fire `setX([])` or `setX(null)` on empty responses — same question.
4. Any optimistic "show cached then refresh" flows — does a failed refresh nuke the cached display?

**The mitigation pattern** (see `src/pages/Workouts.jsx` `refreshWorkoutData` / `fetchWorkout`): use a sentinel (`Symbol('fetch-failed')`) in the catch handler so callers can distinguish failure from empty. Bail out early on `allFailed`. Gate cache writes on `!anyFailed`.

---

## Architecture: Standalone HTML Pages (NOT React SPA)

### POLICY UPDATE (May 2026) — CLIENT WEB APP IS NOW REACT
**The CLIENT-facing web app has moved to the React SPA under `src/`. Do NOT
edit the client-facing root `.html` pages anymore** (e.g. `client-profile.html`,
`dashboard.html`, `planner.html`, `client-feed.html`, `client-intake.html`,
`billing.html`, `view-plan.html`). Client-facing changes go in `src/` React
code only. The frozen HTML client pages stay as-is for reference/history.
- Client-facing change? → edit React under `src/` (e.g. `src/pages/Workouts.jsx`,
  `src/pages/WorkoutHistory.jsx`, `src/pages/Progress.jsx`).
- Shared "evidence of effort" logic lives in `src/utils/workoutEvidence.js`.
- Coach-facing pages: see the rule below — unchanged for now unless stated.

### CRITICAL — Read This First (COACH pages)
The coach-facing tooling is still built with **standalone HTML pages**. For
COACH-facing changes, **edit the coach `.html` files in the project root**. Do
NOT edit React components for coach features unless explicitly asked.

### Live Coach-Facing Pages (root `.html` files)
These are what coaches and clients actually use at `ziquefitnessnutrition.com`:
- `coach-workouts.html` — Workout Builder (3-panel editor)
- `coach-workout-plans.html` — Workout Plans list
- `manage-clients.html` — Client management
- `coach-messages.html` — Messaging
- `coach-stats.html` — Analytics/stats
- `coach-challenges.html` — Challenges
- `coach-profile.html` — Coach profile
- `coach-billing.html` — Billing
- `branding-settings.html` — Branding
- `dashboard.html` — Dashboard
- `planner.html` — Meal planner
- `manage-recipes.html` — Recipe management
- `client-feed.html` — Client feed
- `client-profile.html` — Client profile
- `client-intake.html` — Client intake forms
- `form-responses.html` — Form responses
- `reminder-settings.html` — Reminder settings
- `supplement-protocols.html` — Supplements
- `billing.html` — Client billing
- `view-plan.html` — View plan

### React SPA (`src/` folder)
A partial React rebuild exists in `src/` but is **not the primary codebase**. Some React components duplicate functionality from the HTML pages. Do not assume React components are what's live.

### Rule
- **Coach/client-facing change?** → Edit the `.html` file
- **If unsure which file is live** → Ask the user
- **Keep both in sync** if changes touch shared functionality

## Domain Change Plan (Decided March 2026)

### Decision
- **New domain purchased:** `ziquecoach.com`
- **App name:** "Ziquecoach"
- **App ID:** `com.ziquecoach.app` (already updated in Capacitor/iOS/Android configs)
- **Status:** NOT YET IMPLEMENTED — planning complete, waiting on user to start
- **Strategy update (May 2026):** Only ~10 active clients, so doing a clean cutover (have clients re-save the homescreen icon) instead of dual-domain. Old domain stays as a 301 redirect for ~12 months as safety net.

### Full audit & checklist
**See `DOMAIN-CHANGE-CHECKLIST.md`** for the complete phase-by-phase plan: external services (Supabase/Stripe/DNS), all ~240 code references across 60+ files (with file paths and line numbers), cutover steps, and post-cutover monitoring.

### Decisions LOCKED IN (May 2026)
- System email sender: `noreply@ziquecoach.com` (NEW)
- Business contact email: `contact@ziquefitness.com` (KEEP — user's personal email)
- Master/admin account email: `contact@ziquefitness.com` (KEEP — hardcoded in master-account-guard files, no change needed)
- Capacitor hostname: change `app.ziquefitness.com` → `app.ziquecoach.com`
- Old domain `ziquefitnessnutrition.com`: 301 redirect to new domain for ~12 months, then sunset
- BOTH old domains (`ziquefitnessnutrition.com` AND `ziquefitness.com`) must stay on auto-renew

### Key insights
- Code changes can be done ahead of DNS flip (fallbacks don't affect live site since Netlify `URL` env var controls actual routing)
- Coach branding is stored in DATABASE (`coaches` table), not just code — needs updating via Branding Settings page after code changes, otherwise clients still see old brand
- New Ziquecoach logo needs uploading to Supabase storage (current logo file has "zique fitness" in name)
- Existing clients will be logged out during the 301 redirect (cookies don't cross domains) — heads-up message should include "Forgot Password?" reminder

## Default Workout Template Format

### File Location
`netlify/functions/seed-default-workouts.js` — contains `DEFAULT_PROGRAMS` array. Also update `cleanup-default-workouts.js` if renaming/removing templates.

### How Seeding Works
- Called on page load of `coach-workouts.html` and `coach-workout-plans.html`
- Only inserts if the coach doesn't already have that template (checked by name + `is_template: true`)
- Exercise names **must match the `exercises` table exactly (case-sensitive)** — the seed function enriches with video/thumbnail/animation URLs from DB

### Program Structure
```javascript
{
  name: 'Template Name Here',
  description: 'Short description | days/week | ~duration | highlights',
  program_type: 'strength' | 'hypertrophy' | 'endurance' | 'flexibility' | 'sport_specific' | 'weight_loss',
  difficulty: 'beginner' | 'intermediate' | 'advanced',
  days_per_week: 3,  // number
  program_data: { days: [ /* array of Day objects */ ] }
}
```

### Day Structure
```javascript
{
  name: 'Day 1 — Full Body A',  // "Day N — Description"
  exercises: [ /* array of Exercise objects */ ]
}
```

### Exercise Structure
```javascript
// Reps-based exercise (strength/hypertrophy):
{
  name: 'Chest Press Machine',           // MUST match exercises table
  sets: 3,
  trackingType: 'reps',
  setsData: [
    { reps: 12, restSeconds: 60 },       // one entry per set
    { reps: 12, restSeconds: 60 },
    { reps: 12, restSeconds: 60 }
  ],
  notes: 'Coaching cue here. Controlled tempo — 2 sec up, 2 sec down.'
}

// Time-based exercise (warm-up/stretch/plank):
{
  name: 'Jumping jack',
  sets: 1,
  trackingType: 'time',
  duration: 60,                           // total seconds
  setsData: [
    { duration: 60, restSeconds: 15 }     // one entry per set
  ],
  notes: 'WARM-UP — Get your heart rate up.',
  section: 'warm-up'                      // 'warm-up' | 'cool-down' | omit for main
}
```

### Section Convention
- `section: 'warm-up'` → Warm-up exercises at the top of the day, notes prefixed with "WARM-UP —"
- No section → Main workout exercises in the middle
- `section: 'cool-down'` → Stretches at the bottom, notes prefixed with "COOL-DOWN —"

### Typical Day Layout
1. **Warm-Up** (3-4 exercises, ~5-8 min): Jumping jacks, arm circles, high knees, dynamic stretches
2. **Main Workout** (5-7 exercises): Compound lifts first → isolation exercises, 2-3 sets each
3. **Cool-Down** (4-5 stretches, ~5 min): Static stretches, 1 set × 30s hold each, restSeconds: 0

### Adding a New Template
1. Add the program object to the `DEFAULT_PROGRAMS` array in `seed-default-workouts.js`
2. Exercise names must exist in the `exercises` table **with exact case matching** (the seed function looks them up to attach video/thumbnail URLs)
3. The `CURRENT_DEFAULT_PROGRAM_NAMES` array auto-updates from `DEFAULT_PROGRAMS`
4. Existing coaches who already have the template (by name) will NOT get a duplicate
