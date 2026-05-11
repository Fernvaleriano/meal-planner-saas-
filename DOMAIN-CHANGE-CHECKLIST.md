# Domain Change Checklist — ziquefitnessnutrition.com → ziquecoach.com

**Status:** Planning complete, ready to execute when user gives the go
**Last updated:** May 2026
**Strategy:** Clean cutover (NOT dual-domain) — confirmed best for ~10 active clients

---

## TL;DR

Move everything to `ziquecoach.com`. Tell ~10 existing clients to re-save their homescreen icon. Keep old domain as 301 redirect for 12 months as safety net. No coaches signed up yet, no Stripe payments yet — fresh slate makes this much easier.

---

## Confirmed decisions (don't re-litigate these)

| Decision | Confirmed value |
|----------|----------------|
| New domain | `ziquecoach.com` |
| App display name | `Ziquecoach` (one word) |
| App ID | `com.ziquecoach.app` (already updated in native configs) |
| System email sender | `noreply@ziquecoach.com` (NEW — set up at new domain) |
| Business contact email | `contact@ziquefitness.com` (KEEP — user's personal/business email) |
| Master/admin account email | `contact@ziquefitness.com` (KEEP — hardcoded in master-account-guard files) |
| Capacitor hostname | `app.ziquefitness.com` → `app.ziquecoach.com` |
| Old domain after cutover | 301 redirect to new domain for ~12 months, then sunset |
| Migration approach | Clean cutover, single domain (NOT dual-domain) |

## Domains that must stay alive (auto-renew both for 2-3 years)

- **ziquefitnessnutrition.com** — old app domain, used as 301 redirect
- **ziquefitness.com** — provides the user's personal email `contact@ziquefitness.com`. If this expires, email breaks.

⚠️ Letting EITHER expire will break things. Set both to auto-renew before doing anything else.

---

## Effort summary (don't be intimidated by line counts)

| Bucket | Count | Real effort |
|--------|-------|-------------|
| Critical URL fallbacks (could break prod) | ~15 lines | 10 min |
| Email addresses | ~20 lines | 5 min |
| Brand name strings | ~163 occurrences | mechanical find-and-replace, 1 pass |
| Database branding update | 1 row in DB | 5 min via Branding Settings page or SQL |
| External services (Supabase/Netlify/DNS) | ~5 dashboards | 30 min |
| Docs / cosmetic | misc | low priority |

---

## Phase 1 — Prep (no live changes, do first)

- [ ] Set BOTH old domains to auto-renew for 2-3 years (`ziquefitnessnutrition.com` AND `ziquefitness.com`)
- [ ] Confirm registrar access for `ziquecoach.com`
- [ ] Design/upload new Ziquecoach logo file (PNG, transparent background) — needed in Phase 3

---

## Phase 2 — External Services (set up BEFORE flipping DNS)

### DNS & email infrastructure
- [ ] Point `ziquecoach.com` DNS at Netlify
- [ ] Add `ziquecoach.com` as primary domain in Netlify, get SSL cert
- [ ] Set up SPF + DKIM + DMARC DNS records for `ziquecoach.com` (so emails don't go to spam)
- [ ] Verify new domain in email service (Resend/SendGrid/etc.)
- [ ] Add new sender (`noreply@ziquecoach.com`)

### Supabase
- [ ] Auth → URL Configuration → update **Site URL** to `https://ziquecoach.com`
- [ ] Auth → URL Configuration → add `https://ziquecoach.com/*` to redirect allowlist (keep old URLs there during transition)
- [ ] Update hardcoded URLs inside Supabase email templates if any
- [ ] Upload new Ziquecoach logo to Supabase storage bucket
- [ ] If using Google/Apple OAuth: update authorized redirect URIs in those provider consoles

### Stripe (much simpler — no payments yet)
- [ ] When ready to launch payments: webhook endpoint at `https://ziquecoach.com/.netlify/functions/stripe-webhook`
- [ ] Update Stripe business profile: support email
- (No migration needed — fresh setup)

### Analytics & SEO (optional, post-launch)
- [ ] Google Analytics — add `ziquecoach.com` as a stream
- [ ] Google Search Console — add new property, verify
- [ ] Update any social/marketing links pointing to old URL

---

## Phase 3 — Code Changes (Claude does these)

### CRITICAL — URL fallbacks (15 files, breaks production if wrong)

These all have `process.env.URL || 'https://ziquefitnessnutrition.com'` — change fallback to `ziquecoach.com`:

- [ ] `netlify/functions/invite-client.js:10`
- [ ] `netlify/functions/utils/email-service.js:19`
- [ ] `netlify/functions/send-test-branding-email.js:16`
- [ ] `netlify/functions/create-checkout-session.js:96`
- [ ] `netlify/functions/client-checkout.js:86`
- [ ] `netlify/functions/stripe-connect-onboarding.js:35`
- [ ] `netlify/functions/send-client-password-reset.js:9`
- [ ] `netlify/functions/submit-apply-form.js:138`
- [ ] `netlify/functions/signup-free.js:124`
- [ ] `netlify/functions/stripe-webhook.js:255`
- [ ] `netlify/functions/client-subscription-manage.js:185`
- [ ] `netlify/functions/create-billing-session.js:72`
- [ ] `netlify/functions/send-workout-end-notifications.js:366`
- [ ] `netlify/functions/reactivate-subscription.js:189-190`
- [ ] `scripts/sync-all-exercise-videos.js:17`

### CRITICAL — System email addresses (`noreply@ziquefitness.com` → `noreply@ziquecoach.com`)

- [ ] `netlify/functions/utils/email-service.js:17` — `noreply@`
- [ ] `netlify/functions/send-test-branding-email.js:20` — `noreply@`

### Email addresses staying as `contact@ziquefitness.com` (NO CHANGE)

These reference the user's personal/business email which is being kept as-is. Leave alone:

- `netlify/functions/utils/email-service.js:1256, 1306, 1356`
- `netlify/functions/submit-apply-form.js:8`
- `netlify/functions/master-account-guard.js:27`
- `js/master-account-protector.js:23`
- `netlify/functions/gym-features.js:9`
- `privacy.html:268, 291, 292, 311`
- `terms.html:238, 246`
- `pricing.html:863`
- `signup-success.html:274`
- `subscription-required.html:278`

### Capacitor / native app

- [ ] `capacitor.config.json:9` — change `hostname` from `app.ziquefitness.com` to `app.ziquecoach.com`
- [ ] `android/app/build.gradle:25` — comment example references "ziquefitness", update for consistency

(Note: `appId`, `appName`, iOS Info.plist, Android strings.xml, deep link schemes are ALREADY correct as `ziquecoach`.)

### Brand name "Ziquecoach" → "Ziquecoach" (~163 occurrences)

- [ ] HTML page `<title>` tags across ~50 HTML files
- [ ] `apple-mobile-web-app-title` meta tags (~15 files)
- [ ] `package.json` — `name`, `description`
- [ ] `manifest.json` — `name`, `short_name`
- [ ] `index.html:13` — `og:url` meta tag
- [ ] `branding-settings.html:1628` — mockup URL display string
- [ ] All HTML footers / copyright lines
- [ ] `terms.html`, `privacy.html` — legal text body
- [ ] `index.html:1418`, `pricing.html:854,866` — copyright lines
- [ ] `netlify/functions/utils/email-service.js` — ~40 email template references
- [ ] `js/pwa-install-prompt.js:268` — install prompt text
- [ ] `sw.js` — service worker notification branding
- [ ] Logo `alt` text across 30+ HTML files
- [ ] React components in `src/` (Login, BrandingContext, BrandingSettings, etc.)

### Default branding fallbacks in code

- [ ] `netlify/functions/get-coach-branding.js:19` — `brand_name` default
- [ ] `netlify/functions/get-coach-branding.js:23` — `brand_logo_url` (point to new logo file in Supabase storage)
- [ ] `netlify/functions/dynamic-manifest.js:6,18,19` — default branding fallbacks
- [ ] `.env.example:2,44` — header comment + `EMAIL_FROM_NAME`

### Docs (cosmetic, low priority)

- [ ] `CLAUDE.md` — update Domain Change Plan section once done
- [ ] `LAUNCH-CHECKLIST.md`
- [ ] `PLAY_STORE_RELEASE.md`
- [ ] `ERROR-HANDLING-ANALYSIS.md`
- [ ] `docs/AI-COACH-VISION.md`

---

## Phase 4 — Database update (CRITICAL — easy to forget)

⚠️ **The user's branding is stored in their `coaches` table row, not just code.** Even after all code changes, clients will still see "Ziquecoach" inside the app until this is updated.

- [ ] Open Branding Settings page in the app and update:
  - `brand_name` → "Ziquecoach"
  - `brand_app_name` → "Ziquecoach"
  - `brand_short_name` → "Ziquecoach"
  - `brand_logo_url` → URL of newly uploaded Ziquecoach logo
  - `brand_email_logo_url` → same as above
- [ ] OR update via SQL directly on the `coaches` table for `email = 'contact@ziquefitness.com'`

### SQL migration files reference master email — NO ACTION NEEDED

These reference `contact@ziquefitness.com` which is being kept:
- `supabase-migrations/gym_features.sql:395, 424`
- `supabase-migrations/add-ai-coaching-enhancements.sql:8, 85, 114`
- `supabase-migrations/fix-coach-uuid-mismatch.sql:9, 232`

---

## Phase 5 — The Cutover (pick a low-traffic time)

1. [ ] Send each of the ~10 clients a heads-up message 24-48 hrs before with:
   - Why the change is happening
   - Screenshot/video of "Add to Home Screen" steps (iPhone vs Android differ)
   - Heads-up that they'll need to log in once (saved password won't autofill on new domain)
   - "Forgot Password?" reminder in case they don't remember
2. [ ] Deploy code changes to Netlify
3. [ ] Set Netlify env var `URL=https://ziquecoach.com` (overrides fallbacks)
4. [ ] Make `ziquecoach.com` the primary domain in Netlify
5. [ ] Add 301 redirect: `ziquefitnessnutrition.com/*` → `ziquecoach.com/:splat`
6. [ ] Update Supabase Site URL to new domain
7. [ ] Smoke test golden paths:
   - [ ] New domain loads
   - [ ] Old domain redirects correctly
   - [ ] Login works
   - [ ] App shows "Ziquecoach" branding (not "Ziquecoach")
   - [ ] Coach invites client → email arrives from `noreply@ziquecoach.com` with correct links
   - [ ] Client signup → welcome email works
   - [ ] Password reset email link resolves
8. [ ] Send "we're live" message to clients

---

## Phase 6 — Post-cutover

- [ ] Monitor Netlify function logs for URL/404 errors
- [ ] Monitor email deliverability (check spam folder for new sender)
- [ ] Watch Supabase auth logs for failed redirects
- [ ] Update social media bios, business cards, email signatures
- [ ] Begin native app launch prep (Capacitor → App Store as Ziquecoach)
- [ ] In ~6 months: evaluate sunsetting old domain redirect

---

## Things verified to be UNAFFECTED by domain change (reassurance)

- ✅ **CSP (Content Security Policy)** in `netlify.toml` uses `'self'` — auto-works with new domain
- ✅ **netlify.toml redirects** are path-based (not domain) — unaffected
- ✅ **iOS Info.plist deep link scheme** — already set to `ziquecoach`
- ✅ **Android intent filters** — already set to `ziquecoach://app`
- ✅ **No robots.txt, sitemap, or `.well-known/` files** exist yet — nothing to update (but worth adding later for SEO)
- ✅ **User accounts, passwords, workout history, all data** — tied to user IDs in Supabase, not the domain

---

## Things to know about the cutover (warnings)

### Existing clients will be logged out during the redirect
- Browser session cookies do NOT transfer across domains
- Every client will land on the login screen first time
- Their saved phone password will NOT autofill (browser saves passwords per-domain)
- **Mitigation:** Heads-up message + "Forgot Password?" reminder

### Push notifications won't transfer
- If push notifications are in use, subscriptions are tied to old domain
- Existing clients keep getting them while old domain is alive (during redirect period)
- They'd have to re-allow notifications on new domain (one-way street)
- Low priority since most setups don't rely heavily on web push

### Service worker cache may briefly serve old branding
- Normal PWA behavior — caches refresh on next visit
- Should self-resolve within hours

---

## Final pre-flight checklist (before clicking "go")

Before flipping DNS:
- [ ] All Phase 3 code changes deployed and tested
- [ ] Phase 4 database branding updated
- [ ] All Phase 2 external services configured (especially email DKIM/SPF)
- [ ] Both old domains on auto-renew
- [ ] Client heads-up message sent
- [ ] Time blocked off for monitoring during cutover
