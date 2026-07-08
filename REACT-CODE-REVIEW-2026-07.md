# React App Code Review — July 2026

Full review of the client-facing React app (`src/`, ~67,000 lines). Six parallel review passes
covered: Workouts pages, guided workout mode, nutrition (Diary/Plans/Recipes), app
core (auth/API/lifecycle), remaining pages (Dashboard/Messages/Feed/Billing/etc.), and
miscellaneous components. Top findings were independently re-verified against the code
(marked **VERIFIED**); the rest were reported with concrete failure paths by the reviewers.

Severity groups: **A** = data loss / data corruption, **B** = feature broken outright,
**C** = wrong information shown, **D** = smaller bugs & leaks.

---

## A. Data loss / data corruption (fix first)

### A1. Workout Builder: edits made while an autosave is running are silently lost — VERIFIED
`src/hooks/useWorkoutAutosave.js:85-136`, `src/pages/WorkoutBuilder.jsx:125`
`saveToDb` snapshots state, awaits the PUT, then unconditionally clears the draft and tells the
parent "saved" (`setHasUnsavedChanges(false)`). Any edit made during the in-flight PUT gets its
dirty flag wiped and its localStorage draft deleted, though it was never sent. Coach edits a set
during the 30s autosave, sees "saved", closes the tab → edit exists nowhere.
Fix: after the PUT resolves, compare current state to the snapshot; only clear the dirty flag /
draft if unchanged.

### A2. Plans: "Revert to Original" can overwrite one plan with another plan's data — VERIFIED
`src/pages/Plans.jsx:435-448` (capture), `1440-1468` (revert)
`originalPlanData` is captured only when falsy and never cleared on plan switch (component stays
mounted). Open plan A, then plan B, tap Revert → plan A's meals are written into plan B and
persisted. Fix: key the state to `selectedPlan.id` / reset on plan change (the localStorage
per-plan key already exists — read from it instead of the stale state var).

### A3. Plans: floating Undo button survives switching plans — injects wrong meal
`src/pages/Plans.jsx:180, 847, 986, 1398-1437, 2151`
`undoData` (dayIdx/mealIdx/meal) is never cleared on plan change; tapping Undo after opening a
different plan writes plan A's old meal into plan B at the same indexes and saves it.

### A4. Set editor: peeking at the Time/Distance tab and closing converts the exercise type
`src/components/workout/SetEditorModal.jsx:520-546`; consumers `ExerciseCard.jsx:497-507`,
`ExerciseDetailModal.jsx:1780-1805`
`handleCloseWithAutoSave` (X button and backdrop tap) always saves with the currently-viewed
`editMode`, tagging every set `isTimeBased`. A normal 3×12 strength exercise viewed on the
"Time" tab and closed becomes a 45-second timed exercise (and vice versa). Fix: only apply
`editMode`-derived type changes when the user actually edited on that tab (or on explicit Save).

### A5. Guided mode: opening Play Mode can overwrite already-logged sets with defaults
`src/components/workout/GuidedWorkoutModal.jsx:621-650` (one-time snapshot), `2420-2431`
(auto-persist on landing), `3766` (finish persists all exercises)
`setLogs` snapshots `exercises` once at mount and never re-syncs (unlike ExerciseDetailModal /
ExerciseCard which resync). Landing on an exercise immediately persists the snapshot. If the
merged log hasn't arrived yet (slow fetch / failed fetch on resume), default reps + weight-0
sets are PUT over previously logged ones. These sets are non-empty, so the server-side
`preserveExisting` empty-sets guard does NOT protect them — same failure class as the May 2026
incident. Fix: add the same value-based resync effect the other two components have, and/or
filter finish-save to touched exercises (as `handleCloseWithSave` already does).

### A6. Diary: water intake jumps when changing dates — VERIFIED
`src/pages/Diary.jsx:177, 841-868`
`waterLatestRef` is set on taps but never reset when the date changes or data reloads. Log 5
glasses today, view yesterday (0 shown), tap "+" → yesterday saves as 6. Fix: reset the ref in
the date-change load effect.

### A7. Workouts: per-date cache can pair workout A with workout B's log (multi-workout days)
`src/pages/Workouts.jsx:1592-1600` (writer), `1666-1673` (reader)
The cache-sync effect updates `workoutLog` without updating `todayWorkout`, so after switching
cards the cache holds workout A + workout B's log; the restore path then shows B's
weights/checkmarks on A (if exercise ids overlap) until a successful fetch.

### A8. Workouts: evidence-dots refresh wipes green dots on partial fetch failure
`src/pages/Workouts.jsx:1364-1378` (`refreshEvidenceDates`)
Guard only bails when BOTH requests fail. If only workout-logs 401s on iOS resume while
gym-proofs succeeds, all log-derived dots vanish from the week strip. This is the exact hole
the FAILED-sentinel pattern closes elsewhere — apply the same `anyFailed` gating here.

### A9. Create Workout modal: Escape / phone back button destroys the whole draft
`src/components/workout/CreateWorkoutModal.jsx:56-86`, `AddActivityModal.jsx:327-349`,
`SwapExerciseModal.jsx:66-105`
Parent and child modals each register window-level Escape/popstate handlers; the parent doesn't
guard for `showAddExercise`/`swapExerciseData`. One back press inside the exercise picker closes
BOTH modals and loses the entire built workout. Fix: parent's handler should return early when a
child modal is open.

### A10. Guided mode: AMRAP ("to failure") sets auto-complete at 12 reps — VERIFIED
`src/components/workout/GuidedWorkoutModal.jsx:3039, 3099, 3273, 3629` vs `getExerciseInfo`
(~1456)
Guard checks `exInfo.trackingType !== 'failure'` but `getExerciseInfo` returns `isTillFailure`,
not `trackingType` — the guard is always true. `parseReps(undefined)` defaults to 12
(`workoutProgression.js:35-42`), so the rep countdown arms at 12 and force-logs the set while
the client is still going to failure. Fix: use `!exInfo.isTillFailure` in all four spots.

### A11. Adhoc-workout creation can stamp the new id onto a different workout
`src/pages/Workouts.jsx:2822, 2941, 3045`
After the POST, `setTodayWorkout(prev => ({...prev, id: realId}))` doesn't verify `prev` is still
the created workout. Switch cards while the POST is in flight → the selected workout gets the
adhoc UUID, and every later save 404s silently for the session.

### A12. Coach recommendation accept overwrites duplicate-id exercises
`src/components/workout/ExerciseDetailModal.jsx:2014-2025`
Mapping by `ex.id === currentExercise.id` matches BOTH copies when the same exercise appears
twice in a day (warm-up + main — a case the file itself acknowledges at ~3388). Accepting a
recommendation on the main lift also rewrites the warm-up copy.

---

## B. Features broken outright

### B1. Plans: un-favoriting a meal always fails — `apiDelete` is not imported — VERIFIED
`src/pages/Plans.jsx:6` (imports only `apiGet, apiPost`) vs `:642` (calls `apiDelete`)
ReferenceError every time → optimistic removal reverts with an error toast, 100% reproducible.
One-line fix: add `apiDelete` to the import.

### B2. Coach billing: payment plans list never loads — wrong id sent — VERIFIED
`src/pages/CoachBilling.jsx:387`
Uses `clientData?.id` (a `clients` table bigint; coaches don't have a clients row — verified 0/4
coaches in prod DB) where a coach uuid is needed. GET fires with `coachId=` empty → "No payment
plans yet" forever, while plan CREATION works (server uses the auth token) — inviting duplicate
Stripe products. Fix: use `user.id` like Messages/Feed/Challenges do.

### B3. Feed: "Load More" appends a duplicate of page 1 — VERIFIED
`src/pages/Feed.jsx:762-793`
The initial (reset) fetch never advances `offset` past 0, so the first "Load More" refetches
offset 0 and appends the same 20 meals (duplicate cards + duplicate React keys). Fix: set
`offset` after reset fetches too.

### B4. Guided mode: rep ranges like "8-12" break the flow
`src/components/workout/GuidedWorkoutModal.jsx:638, 3038`
The raw string flows into set logs; `Number.isInteger("8-12")` disables the countdown, the reps
box shows the literal string, and tapping Done saves `reps: "8-12"` (string) — which then fails
`s.reps > 0` checks and pollutes numeric analytics.

### B5. Story viewer: hold-to-pause restarts the story from zero
`src/components/StoryViewer.jsx:93-116`
Un-pausing calls `resetAndStart()` which zeroes elapsed/progress — the accumulate-elapsed code is
dead. Any interaction (pause, reply box, viewers panel) restarts the 6s timer; a story a user
keeps interacting with never finishes.

### B6. PDF export crashes silently in the installed PWA
`src/pages/Recipes.jsx:522-525`, `src/pages/Plans.jsx:1739-1745`
`window.open('', '_blank')` returns null when popups are blocked (common in iOS standalone
mode) → immediate TypeError on `.document` → button does nothing, no message.

### B7. Branding: "Reset All" claims it saves but doesn't
`src/pages/BrandingSettings.jsx:272-294`
Confirm dialog says "This will save immediately" but `handleReset` only clears local form state;
no API call, logo/favicon untouched. Coach believes branding is reset; clients still see it.

---

## C. Wrong information shown

### C1. Date-off-by-one (UTC parse) — check-ins, progress charts, photos
- `src/pages/CheckIn.jsx:353` — `new Date("2026-07-08")` parses as UTC midnight → history shows
  the previous day for anyone west of UTC. Progress.jsx already fixed this with `+ 'T00:00:00'`
  (lines 726/997); CheckIn missed it.
- `src/pages/Progress.jsx:157-160, 366, 1114, 1124, 1552` — MiniChart axis labels, timeframe
  cutoff filter, photo date overlay, comparison modal all have the same raw-parse bug (the
  MetricCard history list nearby is correct, so chart and list disagree).
- `src/pages/Challenges.jsx:335-340` — default start/end use `toISOString()` (UTC date): a US
  coach creating a challenge at 9pm ET defaults to "tomorrow".
- `src/pages/Workouts.jsx:2107, 2092` — `weekSchedule` day-index math mixes local time with UTC
  midnight; the twin computation in `upcomingWorkouts` (~2290) was already fixed with
  `Date.UTC(...)` but this copy wasn't. Week strip can be off by one day in non-UTC timezones.

### C2. "Worked out" evidence counts placeholder rows
`src/utils/workoutEvidence.js:26-58`
`logHasEffort` counts every `sets_data` entry regardless of `completed`. ExerciseDetailModal
auto-writes placeholder rows (`completed: false`) the moment a client opens an exercise to watch
the video (documented in Workouts.jsx ~640/687) → green calendar dot and "Worked out" badge for
days the client only watched a video. Workouts.jsx itself requires `completed === true` — the
evidence module should too.

### C3. Browsing other days' cards creates phantom "Missed" workouts
`src/pages/Workouts.jsx:5320-5343`
The auto-start effect POSTs an `in_progress` log for whatever date is selected — including a
future/past day the client is only previewing. History fills with "Missed" rows for days never
attempted.

### C4. Messages: failed send leaves a permanent fake "sent" bubble and eats the typed text
`src/pages/Messages.jsx:453-509`, merge at `247-271`
Catch never removes the optimistic message nor restores the input; the polling merge deliberately
preserves optimistic messages, so the phantom persists until the conversation is reopened. Client
believes the coach got the message.

### C5. Workout duration carries over between workouts
`src/pages/Workouts.jsx:4085/5323 (set), 4229-4233/4951 (consumed)`
`workoutStartTime` / `actualDurationMinutes` are never reset on completion or card switch. Do
workout A in the morning and B in the evening → B saves a ~9-hour duration or shows A's play-mode
duration.

### C6. Guided mode: completion splash names the wrong exercise
`src/components/workout/GuidedWorkoutModal.jsx:1184, 5271`
Uses `exercises[currentExIndex]` after the index already advanced — shows the NEXT exercise as
"complete". The effect already has `prevIdx` and doesn't use it.

### C7. CheckIn streak is just the row count of the last 10 check-ins
`src/pages/CheckIn.jsx:60` — `setStreak(data.checkins.length)`: 3 check-ins ever (different
months) shows streak 3; a real 40-day streak caps at 10.

### C8. WorkoutHistory: stale-response races show the wrong workout/exercise detail
`src/pages/WorkoutHistory.jsx:534-564, 569-602` — no "is this still selected?" guard on
resolution; fast taps on slow connections render A's data under B. (Also line 571: falls back to
the log-row id as the exercise id → guaranteed-empty drill-down.)

### C9. Coach billing: fixed-amount promo unit ambiguity (dollars vs cents)
`src/pages/CoachBilling.jsx:246-248` vs `273` — input is a bare number sent as-is; display
divides by 100. Coach typing "10" for $10 off creates a $0.10 discount (or the display is 100×
off — one surface is wrong either way).

---

## D. Duplicates, races, leaks, hardening

- **D1. Diary date navigation race — VERIFIED-adjacent:** `Diary.jsx:742-826, 313` — no abort /
  generation counter; fast prev/next can render Sunday's food under Saturday's header, then edits
  hit the wrong day. Fix: request-id guard like Workouts' `dateStr` guard.
- **D2. Double-tap duplicates:** AI-chat "Confirm & Add" (`Diary.jsx:1740-1815, 3004` — no
  disabled/guard; other modals use `isAddingRef`), Dashboard multi-food AI log retry after
  mid-loop failure (`Dashboard.jsx:448-508`), snap-photo "Add all" retry (`FoodModals.jsx:193-251`),
  copy-day partial-failure retry (`Diary.jsx:1110-1142`), ClientBilling "Switch to plan"
  re-enabled before refetch (`ClientBilling.jsx:290-305`).
- **D3. Two search modals mounted at once — VERIFIED:** `Diary.jsx:3626` (inline) and `:4140`
  (`SearchFoodsModal`) both keyed to `showSearchModal`; the hidden inline one has a divergent
  add-path. Delete the inline one.
- **D4. Count-based foods poison measure switching:** `FoodModals.jsx:485-498` +
  `netlify/functions/food-search.js:288, 238` — per-piece foods store serving COUNT as gram
  weight (1 g); switching to "100g"/"Ounce" shows ~53,000-calorie cheeseburgers.
- **D5. Plan meal types don't match Diary buckets:** `Plans.jsx:691` logs `'meal'`/"Meal 3" etc.;
  `Diary.jsx:2218-2223` only groups breakfast/lunch/dinner/snack → entry counts toward totals but
  is invisible/uneditable → double logging.
- **D6. Plan edits are optimistic with swallowed failures:** `Plans.jsx:730-743` — offline meal
  swaps look saved (state + localStorage cache) and silently revert on next fetch.
- **D7. Meal-prep guide + grocery checklist leak between plans:** `Plans.jsx:1545-1549, 160-165,
  1520-1527` — plan A's guide shows (and gets embedded in the PDF) under plan B; grocery checks
  keyed by shifting indexes.
- **D8. Coach flag poisoning on transient error:** `AuthContext.jsx:167-189, 229-235` — VERIFIED
  `checkIsCoach` returns false on ANY error and the value is cached to localStorage → one flaky
  coaches-query demotes a coach across restarts until a fully successful fetch. Distinguish
  "not a coach" from "couldn't check" (don't cache on error).
- **D9. Offline resume can hard-logout:** `AuthContext.jsx:304-338` — resolved
  `{session: null, error}` from a failed token refresh is treated as signed-out; cache deleted,
  redirect to /login while offline. Check `error` before treating null session as authoritative.
- **D10. Branding leaks across users on shared devices:** `AuthContext.jsx` logout sweep +
  `BrandingContext.jsx:110, 417-443` — `zique_branding_preload` isn't cleared on logout and
  `clearBrandingCSS` is dead code (never called). Coach A's logo/colors paint coach B's login.
- **D11. "Flush on suspend" doesn't flush:** `useStatePersistence.js:37-50, 107-115` — suspend
  path still defers through requestIdleCallback/setTimeout, which may never run once hidden.
  Write synchronously on suspend.
- **D12. Auth fetch can hang forever:** `AuthContext.jsx:196-214` — 10s timeout guards only the
  clients query; a hanging coaches query stalls `Promise.all` → infinite LoadingScreen.
- **D13. Stale session can clobber fresher token in API cache:** `utils/api.js:187-195` vs
  `315-326` — localStorage-fallback resolution overwrites a TOKEN_REFRESHED-primed cache with an
  expired token stamped as fresh (up to 2 min of 401+retry churn after resume).
- **D14. Unguarded `localStorage.setItem` for theme:** `AuthContext.jsx:159, 449` — quota
  exhaustion (this app stores heavy caches) crashes boot to the error boundary. Wrap in
  try/catch like every other write.
- **D15. Service worker caches error responses:** `sw.js:288-305, 310-333, 219-241` — caches
  non-OK HTML (500/404 pages served offline later), caches 404s for old hashed chunks during
  deploys (cache-first serves them for the session), and one SWR branch can respondWith(null).
  Gate all `cache.put` on `response.ok`.
- **D16. Failed completion save masked as success:** `Workouts.jsx:4240-4283` — timeout/failure
  still shows "Great job", clears the local completion backup; workout stays "In Progress"
  server-side with no retry path.
- **D17. Audio keep-alive interval leaks after closing guided mode mid-countdown:**
  `GuidedWorkoutModal.jsx:3475-3484` — unmount cleanup skips `stopTickKeepAlive()` when the
  countdown was active; audio session held (battery/music suppression) until reload. Related:
  switch-sides setTimeout chain (~3107-3117) not cleared on unmount.
- **D18. Blob-URL / media leaks:** stale exercise video blob shown for the wrong exercise + never
  revoked (`ExerciseDetailModal.jsx:608-624, 2184-2188`); guided video blob never revoked on
  unmount (`GuidedWorkoutModal.jsx:2278-2330`); voice recorder double-start leaks the first mic
  stream (`voiceRecorder.js:34-98`); VoiceNotePlayer seek throws on Infinity-duration webm
  (`VoiceNotePlayer.jsx:72-84`).
- **D19. WorkoutBuilder marks itself unsaved on load:** `WorkoutBuilder.jsx:206-208` — effect
  fires on mount/load with no edit → blocks "Assign to clients" ("save first"), spurious
  leave-site dialog, spurious draft banners, pointless 30s PUTs of unchanged programs.
- **D20. Assorted:** feed render crash on malformed `setsData` JSON (`Feed.jsx:536`, no
  try/catch in JSX); ClubWorkouts renders array `sets` as React child → white screen
  (`ClubWorkoutsModal.jsx:463`); ClubWorkouts one pushState vs multi-level back → second back
  leaves the page (`:166-195`); reacting to a just-sent (optimistic) message posts a fake id
  (`Messages.jsx:535-586, 1062-1067`); Login doesn't trim/lowercase email while ForgotPassword
  does (`Login.jsx:102-105`); voice-input applies over a stale sets snapshot in SetEditorModal
  (~273-325) and ExerciseCard (~782-819) — ExerciseDetailModal already fixed this with a
  functional updater; ExerciseCard resync drops RPE/%1RM/HR-zone/pace/incline fields
  (`ExerciseCard.jsx:369-392`); `useInstallPrompt` never removes its `appinstalled` listener
  (`useInstallPrompt.js:47-57`); backup exercise save hardcodes `order: 1`
  (`Workouts.jsx:3406-3411`) → wrong exercise order in rebuilt history; module toggles need two
  taps for keys missing from `client_modules` (`BrandingSettings.jsx:516-529`); branding
  upload/color inputs unvalidated (`BrandingSettings.jsx:164-188, 29-56`); same-photo re-pick
  does nothing in CreateStoryModal (`:47-57`); `stampPhoto` promise can hang with no
  `img.onerror` (`GymProofModal.jsx:106-166`, `WeightProofModal.jsx:88-130`); "Add this
  exercise" in the preview silently toggles selection (`AddActivityModal.jsx:604-641`);
  `handleUncheckAll` persists via a side effect raced against a 50ms timer
  (`Workouts.jsx:2485-2527`); Escape-in-passive-listener swipe bug
  (`CreateWorkoutModal.jsx:284`); dead code `handleAiLog`/`handleAddFromFavorite` in Diary
  (would crash if wired up).

---

## Suggested fix order

1. **One-liners with big payoff:** B1 (import `apiDelete`), B2 (`user.id`), B3 (advance offset),
   A10 (`isTillFailure`), C6 (`prevIdx`), C1 CheckIn date (`+ 'T00:00:00'`).
2. **Data-loss guards:** A1, A4, A5, A6, A9, A2/A3.
3. **State-bleed on the persistently-mounted pages** (Plans/Diary/Workouts never remount —
   several bugs share this root cause): A2, A3, A6, C5, D7 → add a "reset per-plan/per-date
   state" effect keyed on plan/date change.
4. Everything else by group.
