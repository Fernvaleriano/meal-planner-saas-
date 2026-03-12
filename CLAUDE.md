# Project Memory

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
