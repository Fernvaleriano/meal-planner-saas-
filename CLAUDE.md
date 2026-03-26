# Project Memory

## Architecture: Standalone HTML Pages (NOT React SPA)

### CRITICAL — Read This First
The live production app is built with **standalone HTML pages**, NOT the React SPA. When making changes, **always edit the `.html` files in the project root**. Do NOT edit React components in `src/pages/` or `src/components/` unless explicitly asked.

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
- **App ID:** `com.ziquecoach.app`
- **Status:** NOT YET IMPLEMENTED — waiting until closer to App Store launch

### Strategy (Dual Domain)
- `www.ziquecoach.com` → marketing/signup site for **coaches** signing up
- `ziquefitnessnutrition.com` → stays alive for **existing clients** so their homescreen saves keep working
- Gradually transition clients to the native app (Capacitor), which eliminates the homescreen/domain dependency
- Eventually sunset the old domain once clients are on the native app

### What Needs to Happen (When Ready)
1. Update codebase: all domain refs, app name, app ID, email addresses to ziquecoach.com
2. Point ziquecoach.com DNS to Netlify
3. Set up email DNS records (SPF/DKIM) for @ziquecoach.com
4. Update Stripe webhook URL
5. Update Supabase redirect URLs
6. Keep ziquefitnessnutrition.com alive with redirects
7. Submit to App Store as "Ziquecoach"

### Known Issues to Fix During Domain Change
- Inconsistent domain fallbacks in code (3 different variants: ziquefitnessnutrition.com, ziquefitness.com, ziquefitnutrition.com typo)
- ~20 files need domain/URL updates
- Email addresses across 6+ files need updating

### Key Insight
- Code changes can be done ahead of DNS flip (fallbacks don't affect live site since Netlify URL env var controls actual routing)
- PWA homescreen saves WILL break for clients on the old domain — native app solves this long-term

## Default Workout Template Format

### File Location
`netlify/functions/seed-default-workouts.js` — contains `DEFAULT_PROGRAMS` array. Also update `cleanup-default-workouts.js` if renaming/removing templates.

### How Seeding Works
- Called on page load of `coach-workouts.html` and `coach-workout-plans.html`
- Only inserts if the coach doesn't already have that template (checked by name + `is_template: true`)
- Exercise names **must match the `exercises` table exactly** (case-insensitive lookup enriches with video/thumbnail/animation URLs from DB)

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
2. Exercise names must exist in the `exercises` table (the seed function looks them up to attach video/thumbnail URLs)
3. The `CURRENT_DEFAULT_PROGRAM_NAMES` array auto-updates from `DEFAULT_PROGRAMS`
4. Existing coaches who already have the template (by name) will NOT get a duplicate
