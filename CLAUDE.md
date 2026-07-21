# Project Memory

## 🗣️ HOW THE FOUNDER WANTS YOU TO TALK (READ ME FIRST)

**Talk like a normal human, not a developer.** This applies to every
response, every chat, forever — not just technical ones.

- **No jargon.** Don't say "useEffect," "debounce," "localStorage,"
  "memory pressure," "tab eviction." Say what they DO in plain words.
- **Use examples / analogies.** "It's like a Word doc that only saves
  when you close it" beats "the persist call only fires on the close
  handler."
- **Short responses.** Default to a few sentences. Long tables, code
  dumps, headers, and bulleted breakdowns are NOT what he wants unless
  he asks for them.
- **Plain English first; technical detail only if asked.** When he
  asks "why did X happen?" — answer with the cause in everyday words,
  not file paths and line numbers. He'll ask for the technical detail
  if he wants it.
- **Skip the meta.** Don't narrate what you're about to do, don't
  summarize what you just did, don't ask "want me to also do Y?" three
  times. Get to the point.

If you find yourself writing a wall of text with code blocks and
headers in a casual conversation — stop, delete, rewrite plain.

## ⚠️ GYM VERSION ≠ COACHING VERSION (REMEMBER THIS)

There are TWO different products and they are NOT the same:
- **Coaching version** — the one-on-one online-coaching app (regular coach
  accounts). Has macro/nutrition tracking, meal plans, recipes, diary, etc.
- **Gym version** — the white-label GYM product (`coaches.is_gym = true`
  accounts like Huracan Fitness and Goliath Strength). Login routes the
  owner to `gym-dashboard.html`. It centers on **workouts + progress**, plus
  a leaderboard (video-proof lifts), gym check-in, shop, and — where the gym
  wants it — a **VIEW-ONLY meal plan**: the member can SEE the coach's plan
  and its macros (and a coach voice note), but there is **NO nutrition
  TRACKING** — no food diary / "log to diary", no AI meal swap/revise/custom,
  no recipes module. The `diary` module is OFF for gyms.

Key rule: a gym can HAVE a coach-assigned meal plan, but it must stay
read-only. Do NOT add/expose diary logging, meal swapping/revising, or
macro-tracking UI on a gym. Detect a gym member in the client app with the
app-wide convention: `!clientData?.is_coach && !isModuleVisible('diary')`.
If unsure which product a request is about, ask.

### Multi-trainer ("gym owns, trainer borrows") — see `MULTI-TRAINER-NOTES.md`
A gym owner can add **trainers** (sub-coaches) who each coach a slice of the
gym's clients. Locked model: **the gym owns every client** (`clients.coach_id`
= gym owner); a trainer only sees/adds clients **assigned** to them
(`clients.trainer_id`). A trainer is a login with a `gym_trainers` row and NO
`coaches` row; `resolveGymContext()` in `netlify/functions/utils/auth.js` tells
owner from trainer. Slice 1 (login + see/add assigned clients) is built:
`trainer-dashboard.html`, `netlify/functions/trainer-clients.js`. Next slices
(workouts, meal plans, messages) + a per-trainer permissions layer are pending.
**Golden rule: SCOPE every trainer screen to their assigned clients — an
unscoped page leaks the whole gym's roster.** Full risk log in the doc.

## 🆕 ONBOARDING A NEW COACH/GYM — PRESETS (locked July 2026)

A coach/gym account's "view" is controlled by **two things** on the
`coaches` row: `is_gym` (which dashboard the OWNER sees — gym-dashboard vs
dashboard) and `client_modules` (a JSON object of on/off toggles for what
their MEMBERS see). Keys: `diary` (meal logging), `plans` (meal plans),
`workouts`, `messages`, `recipes`, `check_in`, `progress`, `leaderboard`
(ranks), `shop`. Branding + login live on the same row / `gym_join_codes`.

**The four presets the founder approved — apply `is_gym` + these
`client_modules` exactly:**

| Preset | is_gym | diary | plans | recipes | workouts | messages | check_in | progress | leaderboard |
|---|---|---|---|---|---|---|---|---|---|
| **Full Coaching** (e.g. contact@ziquefitness.com) | false | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Lite Coach** | false | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Gym** | true | ✗ | ✓ (view-only) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Basic Gym** | true | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |

- `shop` defaults OFF for all; turn on only if asked.
- Lite Coach = coaching account with **no meal logging** (diary off), but
  meal plans + recipes + ranks stay.
- Gym vs Basic Gym: the ONLY difference is the view-only meal plan
  (`plans`) — Gym has it, Basic Gym has zero nutrition.
- "View-only meal plan" on gyms = `plans:true` + `diary:false` (they see
  the plan/macros, no tracking) — matches the gym rule above.

**Intake — what to get from the founder per new account (the rest I set up):**
1. **Preset** (Full Coaching / Lite Coach / Gym / Basic Gym) + any one-off
   toggle exception ("but they DO want meal logging").
2. **Owner email** (their login) + whether to set a temp password or invite.
3. **Brand kit**: business name, logo image, and their website (pull
   colors/logo from it); app name/short name if different from the business
   name.
4. **Member cap** (join-code limit) — gyms.
5. **Web address**: shared ziquecoach.com + join code/link, OR their own
   white-label domain (needs DNS on their end; see gym domain map in
   `gym-join-page.js` / `gym-join.html`).

**Mechanics to apply (via Supabase MCP `execute_sql` + branding):**
- `coaches` row: set `is_gym`, `subscription_tier`, `client_modules`
  (the preset JSON), `brand_name`, `brand_logo_url`, brand colors,
  `brand_app_name`, `brand_short_name`.
- Gyms: create a `gym_join_codes` row (`code`, `coach_id`, `member_cap`,
  `is_active:true`) AND set `coaches.video_upload_code` (for the
  `/gym-upload` drop-off). The gym's video upload link is
  `ziquecoach.com/gym-upload?g=<coach_id>&c=<video_upload_code>`.
- Branding is read by `get-coach-branding.js`; the coach sidebar logo swap
  + Ranks nav item are driven by `coaches.brand_logo_url` + `is_gym` (see
  `js/coach-layout.js`).

## ⚠️ OPERATIONAL REMINDERS — ACTION REQUIRED (read me)

- **DECISION (May 2026): WEB-ONLY. Native / App Store is intentionally
  DROPPED.** Ziquecoach is a web app (PWA) only. Submitting to the
  Apple App Store / Google Play and shipping a native Capacitor build
  is **deliberately abandoned** — chosen by the founder for instant
  bug-fix deploys (no app-store review latency), lower maintenance, and
  because distribution is coach-invite based (no app-store discovery
  needed). **Implications for anyone (human or AI) working here:**
  - The "broken Capacitor mobile build" in LAUNCH-CHECKLIST.md is NOT a
    bug to fix. Do not repair/resurrect the Capacitor build, Android
    keystore, App ID, FCM/APNs, or App Store compliance tasks. Treat
    `android/`, `ios/`, `capacitor.config.json`, `vite.config.mobile.js`
    as parked/legacy.
  - Push notifications, if ever wanted, go via PWA web push — not
    native. Optional, not a launch blocker.
  - The web app IS the product: prioritize PWA reliability (service
    worker / install / offline / no stale cache) over anything native.
  - GDPR export/deletion work was still correct — privacy law is
    platform-independent.

- **TODO: add Google + Apple sign-in / sign-up.** Currently only
  email+password. Competitors (e.g. burnon.ai) already offer social
  login — less signup friction, expected by users. Start with Google
  (Supabase has it built in, fastest payoff). Apple later — needs a
  paid Apple Developer account and is fussier to set up. Watch for
  the "same person, two accounts" edge case (signed up with Google,
  later tries email) — Supabase mostly handles it but worth testing.

- **PENDING: capture a DB schema baseline.** The migration files do NOT
  create the base schema (no migration creates `clients`/`coaches`;
  prod has 74 tables / 10 funcs / 199 policies, version control creates
  almost none). A fresh DB cannot be rebuilt — DR / staging / RLS-audit
  risk (prod itself is fine). Fix = capture a `pg_dump` baseline per
  **`/DB-RECOVERY-RUNBOOK.md`**. Must be a real dump (not hand-rolled).
  Two migration dirs reconciled: `supabase/migrations/` = canonical,
  `supabase-migrations/` = archived (see their READMEs). Diagnosis done
  May 2026; baseline capture needs local DB/CLI access — not yet done.

- **DECIDED (May 2026): new "premium all-inclusive" pricing** — Free 3 /
  Starter 15·$59 / Growth 50·$129 / Scale 100·$179 / Agency
  200·$299 / 200+ contact sales. Full rationale + implementation
  checklist in **`COACH-LIMITS-AND-PRICING.md`** (now on the main
  working branch). (Was originally saved only on branch
  `claude/document-coach-limits-k8BxD` and nearly lost — consolidated
  here so it persists.)
  - **ONLY Agency changed so far (July 2026): $199 → $299.** Founder
    decided to move just the top tier for now (the $179→$199 gap was
    far too soft — a roster doubling from 100→200 clients should pay
    more). Starter/Growth/Scale are LEFT AS-IS on the live site
    ($49 / $99 / $179, client counts unchanged) — the rest of the
    "premium all-inclusive" set above (Starter $59/15, Growth $129) is
    still just strategy, NOT rolled out. Do not touch those without an
    explicit go-ahead.
  - **Agency $299 display updated everywhere** (`index.html`,
    `pricing.html`, `signup.html`, `billing.html`, `coach-profile.html`).
    Client-limit code (`netlify/functions/create-client.js`
    `CLIENT_LIMITS`) needed no change — Agency was already 200.
  - **Agency is now CONTACT-SALES, not self-serve (July 2026).** To dodge
    the Stripe-price setup, the founder chose to keep the $299/mo showing
    but turn the button into "Contact sales" (mailto
    `contact@ziquecoach.com`) on `index.html` and `pricing.html`. On
    `signup.html` the Agency option is no longer a selectable radio — it's
    a mailto card (the plan-select JS null-guards it; `'professional'` was
    dropped from the `planFromUrl` allowlist). So there is NO self-serve
    Agency checkout path in the UI anymore.
  - **Result: NO Stripe price change needed for Agency.** Nothing self-serve
    hits `STRIPE_PRICE_PROFESSIONAL`, so displayed $299 can't mis-charge.
    Agency deals are handled manually now (founder sets up the subscription
    /invoice off a "Contact sales" email). Existing $199 Agency subscribers
    are untouched. The backend `create-checkout-session.js` still knows the
    `professional` tier — harmless, just no UI triggers it.

## MARKETING CAROUSEL STYLE (BRAND-CONSISTENT — REUSE FOR ALL POSTS)

When the founder asks for slides, ads, Instagram posts, or any marketing
visuals, use THIS style every time so the brand stays consistent. (Style
locked May 2026, inspired by BurnOn but using Ziquecoach colors.)

### Brand colors (use these EXACT hex codes — not "teal," not "mint")
- **Dark navy background:** `#0A1F2E` (flat, no gradient)
- **Bright turquoise accent:** `#2EC4B6` (matches the real logo)
- **White text:** clean white for body copy
- The brand is TURQUOISE, not teal. Teal drifts too green/dark.

### Format
- **1:1 square (1080×1080)** for Instagram carousels — NOT 9:16 (that's
  Stories/Reels) and NOT 4:5 (founder prefers square).
- One slide per image, generated separately in GPT.

### Layout (every slide)
- **Top-left:** real Ziquecoach logo, uploaded as reference image. Do NOT
  let GPT redraw it, do NOT let it add leaf doodles or extra marks.
- **Left side:** big bold sans-serif headline, 2–3 lines, ALL CAPS,
  accent words in turquoise, rest in white.
- **Hand-drawn turquoise brush underline** beneath the last/key word.
- **Subhead** in plain white below headline, short and human.
- **Right side or bottom:** photorealistic person (coach or client) cut
  out cleanly against the dark navy, dramatic side lighting with a
  subtle turquoise rim light.
- **Phone/laptop mockups** floating, tilted slightly — use real
  uploaded screenshots inside the frames whenever possible.

### Critical rules (prevents the usual AI failures)
- Headline text must read EXACTLY as written. No duplicated words
  (the "FREE. FREE." disaster). Add this line to every prompt:
  *"Headline must read EXACTLY: [text] — no duplicated words, no typos.
  All text sharp and readable."*
- Macro tiles / UI elements must use uniform brand colors — do NOT let
  GPT make them red/green/beige rainbow.
- URLs display without `www` and without `<angle brackets>` — just
  `ziquecoach.com` plain.
- Use ChatGPT (newer image model) over Grok — handles text + reference
  images way better.
- Upload logo + a real app screenshot at the start of the GPT chat
  ONCE; reuse across all slides in the same conversation for
  consistency.

### Standard 5-slide story arc (carousel structure that converts)
1. **Hook** — pain point (e.g. "STOP CHASING. START COACHING.")
2. **Client side** — what the client experiences
3. **Feature / proof** — the magic moment (AI, automation, etc.)
4. **Coach side** — what the coach gains (dashboard, visibility)
5. **CTA** — free tier offer + button + ziquecoach.com

Optional: drop slide 3 for a tighter 4-slide carousel.

### CTA wording (locked)
- Headline: "TRY ZIQUECOACH FREE."
- Subhead: "Free for 3 clients. Upgrade when you grow."
  (Do NOT say "forever" — locks us in.)
- Button: "START FREE →"

### Reference: the actual prompt template
See conversation history May 2026 — full per-slide prompts are written
out there. Pattern: dark navy bg, turquoise accent, logo top-left,
bold headline w/ accent word in turquoise + brush underline, subhead,
cut-out person right, phone/laptop mockup with real screenshot inside.

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

**Server-side last line of defense (May 2026, root fix — DO NOT REMOVE):**
the client patches above are all symptom-level. The invariant that
actually makes workouts un-loseable lives in
`netlify/functions/workout-logs.js`: in BOTH the PUT and POST
exercise-upsert loops, a save whose incoming `sets` is empty must
NEVER overwrite an `exercise_logs` row that already has real logged
sets (`preserveExisting` / the `setsData.length === 0 && existing
setCount > 0` guard). When it triggers, only safe metadata
(name/order/notes) is updated and the stored sets + their workout-level
totals are kept. This is never a legitimate "user cleared an exercise"
action — clearing/skip goes through status, not an empty-sets write.
Diagnosed via Edward Moreno's 2026-05-18 logs (a ~10h iOS resume gap
between two halves of one session fed plan-default empty exercises into
the finish-save, blanking earlier logged sets). If you ever see this
guard removed or an empty-sets path that bypasses it, that is the
regression — restore the guard.

---

## Architecture: Standalone HTML Pages (NOT React SPA)

### POLICY UPDATE (May 2026) — CLIENT WEB APP IS NOW REACT
**The CLIENT-facing web app has moved to the React SPA under `src/`. Do NOT
edit the client-facing root `.html` pages anymore** (e.g. `client-profile.html`,
`dashboard.html`, `planner.html`, `client-feed.html`, `client-intake.html`,
`billing.html`, `view-plan.html`). Client-facing changes go in `src/` React
code only. The legacy root HTML pages are NOT "frozen/untouched" (git
history shows ongoing edits) — the rule is NO NEW EXPANSION: do not add
new features, vanilla-JS state, or DOM to them. Surgical bug fixes to
existing behavior only; anything bigger → build it as a React route.
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

### Build pipeline (verified May 2026)
- Vite has a SINGLE entry: `app-test.html` → `app-test-dist/`, served at
  `/app` (SPA fallback `/app/*`). Root `.html` files are served
  STATICALLY (`publish="."`) and are NOT in the Vite/Rollup build graph.
- Consequence: in-page React "islands" are NOT cheap (no per-component
  build output). Do not introduce island/microfrontend build infra.
- Migration pattern = PAGE-LEVEL strangler: rebuild a legacy page as a
  route in the `/app` SPA, then 301 the old `.html` in `netlify.toml`
  (already proven: portal.html, client-login.html, client-dashboard.html).

### Rule
- **Coach/client-facing change?** → Edit the `.html` file
- **If unsure which file is live** → Ask the user
- **Keep both in sync** if changes touch shared functionality

## Domain Change Plan (Decided March 2026)

### Decision
- **New domain purchased:** `ziquecoach.com`
- **App name:** "Ziquecoach"
- **App ID:** `com.ziquecoach.app` (already updated in Capacitor/iOS/Android configs)
- **Status:** COMPLETE (May 2026). Both the code side AND all external
  services have been cut over. Verified live:
  - Supabase Auth Site URL = `https://ziquecoach.com`, and
    `https://ziquecoach.com/**` is on the Redirect URLs allowlist (the
    old `ziquefitnessnutrition.com/**` is also kept on the allowlist
    as a safety net during the 12-month redirect window).
  - Stripe webhooks pointing at the new domain — processed_webhook_events
    shows daily traffic from both `platform` and `connect` sources.
  - Email sender `noreply@ziquecoach.com` verified in Resend with SPF +
    DKIM, and a DMARC TXT record (`v=DMARC1; p=none;
    rua=mailto:contact@ziquefitness.com`) is published at GoDaddy on
    `_dmarc.ziquecoach.com`. New-domain sender reputation is still
    warming up — early sends may land in spam for ~1–2 weeks; this is
    expected and resolves with normal send volume, not with more setup.
  - `netlify.toml` 301-redirects `ziquefitnessnutrition.com/*` →
    `ziquecoach.com/:splat`; zero `ziquefitnessnutrition` refs left in
    `.html/.js/.jsx`.
  No further external cutover work required.
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

### ⚠️ "LOAD IT INTO MY BUILDER" = DIRECT DB INSERT, NOT JUST THE SEED FILE (DO THIS EVERY TIME)
When the founder says *"load it into my workout builder like you always do,"*
editing `seed-default-workouts.js` is **NOT enough** — that only takes effect
after the code is deployed live AND the page is reloaded, so the template will
NOT actually appear in his builder. He means: **make it show up in his builder
right now.** So after adding the program to the seed file, you MUST ALSO insert
it directly into his coach account via the Supabase MCP (`execute_sql`):
- **His coach account:** `coaches.email = 'contact@ziquefitness.com'`,
  `coach_id = ab3acf54-0499-46b7-b130-63e836e70503` (name "Ziquecoach", the
  master/admin account). Confirm the id by email each time in case it changes.
- **Insert into `workout_programs`** with `coach_id` above, `is_template: true`,
  `is_published: false`, `is_club_workout: false`, plus name/description/
  program_type/difficulty/days_per_week/program_data.
- **Enrich exactly like the seeder does:** for every exercise, look it up in
  `exercises` (globals `coach_id IS NULL` take priority, then his customs),
  case-insensitive on name, and attach `id`, `video_url`, `animation_url`,
  `thumbnail_url`, `muscle_group`, `equipment`, and overwrite `name` with the
  exact DB casing. An exercise WITHOUT these enriched fields shows up with no
  video/thumbnail — that's the failure the founder keeps catching.
- **⚠️ ALSO attach `reference_links` (fixed July 2026 — do NOT regress):**
  merge, deduped by `url`, (a) the `exercises.reference_links` column of the
  matched row + (b) his saved global links from `coach_exercise_references`
  (`coach_id` = his, `exercise_name` matched case-insensitively — he has one
  saved for ~430 exercises). The builder bakes these into `program_data` at
  add-time, so a workout inserted WITHOUT them forces him to tap "Load" on
  every exercise before the links reach a client's calendar — that was the
  long-standing "reference links don't upload" bug. The seeder
  (`seed-default-workouts.js`) now does this merge — copy its
  `mergeReferenceLinks` behavior.
- **Do the enrichment + insert in ONE `execute_sql`** so the big program_data
  JSON never has to be hand-retyped: generate it with a small node script
  (read `DEFAULT_PROGRAMS`, dollar-quote the raw `program_data`, then a SQL CTE
  joins to `exercises` and rebuilds the days). Pattern lives in this session's
  history (program #448, "Upper Lower Split - Full Gym (4 Day)", June 2026).
- **Verify after insert:** `RETURNING` the day count, total exercise count, and
  count of exercises with an `id`/`video_url` — they must be equal (e.g. 53/53).
  If `matched < total`, an exercise name is wrong (didn't match the library).
- Skip the insert only if that template name already exists for his coach_id
  (avoid duplicates).
- **ALWAYS set a cover photo (locked July 2026):** every program you insert
  MUST get a `program_data.image_url` from the shared "Default Workout
  Pictures" storage bucket (public URL
  `.../storage/v1/object/public/Default%20Workout%20Pictures/<file>`). Never
  leave a program with a blank cover. This is the same curated pool the
  client-facing AI generator picks from (`workout-cover-library.js` lists it),
  and the server now defaults any coverless save to a random one from it
  (`workout-programs.js` POST). Pick from the folder at random / spread them so
  no two look alike; the founder can swap any later.
