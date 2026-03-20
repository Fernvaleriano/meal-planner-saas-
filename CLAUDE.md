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

## SQL Migrations

### Rule
When a new Supabase table or migration is needed, **always output the SQL directly in the chat** so the user can copy and paste it into the Supabase SQL Editor. Do NOT just reference a migration file — put the SQL inline in the response.
