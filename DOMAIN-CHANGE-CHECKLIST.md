# Domain Change Checklist — ziquefitnessnutrition.com → ziquecoach.com

**Status:** Planning — not yet implemented
**Decided:** March 2026
**Last updated:** May 2026

## Quick context

- Moving from `ziquefitnessnutrition.com` to `ziquecoach.com`
- App name: "Ziquecoach"
- App ID: `com.ziquecoach.app` (already updated in Capacitor/iOS/Android configs)
- ~10 active clients — small enough to do a clean cutover (no dual-domain complexity needed)
- Strategy: have clients re-save the homescreen icon. Keep old domain as 301 redirect for ~12 months as safety net.

## Effort summary (don't be scared by line counts)

| Bucket | Count | Real effort |
|--------|-------|-------------|
| Critical URL fallbacks (could break prod) | ~15 lines | 10 min |
| Email addresses | ~20 lines | 5 min |
| Brand name strings | ~163 occurrences | mechanical find-and-replace, 1 pass |
| External services (Supabase/Stripe/DNS) | ~6 dashboards | 30 min |
| Docs / cosmetic | misc | low priority |

---

## Decisions still needed (before starting)

1. **New email addresses** — confirm `noreply@ziquecoach.com`, `contact@ziquecoach.com`, `privacy@ziquecoach.com`?
2. **Master/admin account email** — currently `contact@ziquefitness.com` in 2 places identifies admin. Migrate to `contact@ziquecoach.com` or keep old?
3. **Capacitor hostname** — change `app.ziquefitness.com` → `app.ziquecoach.com`?
4. **Order of operations** — code changes first, or external setup first?

---

## Phase 1 — Prep (no live changes)

- [ ] Confirm `ziquecoach.com` registered and registrar access ready
- [ ] Confirm `ziquefitnessnutrition.com` renewed for 12+ more months
- [ ] Decide on email provider strategy
- [ ] Lock in app display name "Ziquecoach" (one word)
- [ ] Lock in new email addresses

---

## Phase 2 — External Services (set up BEFORE flipping DNS)

### DNS & email infrastructure
- [ ] Point `ziquecoach.com` DNS at Netlify
- [ ] Add `ziquecoach.com` as domain in Netlify, get SSL cert
- [ ] Set up SPF + DKIM + DMARC DNS records for `ziquecoach.com`
- [ ] Verify new domain in email service (Resend/SendGrid/etc.)
- [ ] Add new sender (`noreply@ziquecoach.com`)

### Supabase
- [ ] Auth → URL Configuration → update **Site URL** to `https://ziquecoach.com`
- [ ] Auth → URL Configuration → add `https://ziquecoach.com/*` to redirect allowlist (keep old during transition)
- [ ] Update hardcoded URLs in Supabase email templates
- [ ] If using Google/Apple OAuth: update authorized redirect URIs in those provider consoles

### Stripe
- [ ] Add new webhook endpoint: `https://ziquecoach.com/.netlify/functions/stripe-webhook`
- [ ] Keep old webhook live during transition; remove after cutover stable
- [ ] Update Stripe business profile: support email to new domain
- [ ] Update Customer Portal branding/return URLs if customized

### Analytics & SEO
- [ ] Google Analytics — add `ziquecoach.com` as a stream
- [ ] Google Search Console — add new property, verify, file change-of-address
- [ ] Update any Google/Meta ads pointing to old URL

---

## Phase 3 — Code Changes

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

### CRITICAL — Email addresses (~10 files)

- [ ] `netlify/functions/utils/email-service.js` — `noreply@`, `contact@` (lines 17, 1256, 1306, 1356)
- [ ] `netlify/functions/send-test-branding-email.js:20` — `noreply@`
- [ ] `netlify/functions/submit-apply-form.js:8` — `contact@`
- [ ] `netlify/functions/master-account-guard.js:27` — master account email
- [ ] `js/master-account-protector.js:23` — master account email
- [ ] `netlify/functions/gym-features.js:9` — `contact@`
- [ ] `privacy.html:268, 291, 292, 311` — `privacy@`, `contact@`
- [ ] `terms.html:238, 246` — `contact@`
- [ ] `pricing.html:863` — `contact@`
- [ ] `signup-success.html:274` — `contact@`
- [ ] `subscription-required.html:278` — `contact@`

### Capacitor / native app

- [ ] `capacitor.config.json:9` — change `hostname` from `app.ziquefitness.com` to `app.ziquecoach.com`
- [ ] `android/app/build.gradle:25` — comment example references "ziquefitness", update

(Note: `appId`, `appName`, iOS Info.plist, Android strings.xml, deep link schemes are ALREADY correct as `ziquecoach`.)

### Brand name "Zique Fitness Nutrition" → "Ziquecoach" (~163 occurrences)

Mechanical find-and-replace targets:

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

### Config files

- [ ] `.env.example:2,44` — header comment + `EMAIL_FROM_NAME`
- [ ] `netlify/functions/dynamic-manifest.js:6,18,19` — default branding fallbacks
- [ ] `netlify/functions/get-coach-branding.js:17,19` — default branding fallbacks

### Docs (low priority, cosmetic)

- [ ] `CLAUDE.md` — update the Domain Change Plan section once done
- [ ] `LAUNCH-CHECKLIST.md`
- [ ] `PLAY_STORE_RELEASE.md`
- [ ] `ERROR-HANDLING-ANALYSIS.md`
- [ ] `docs/AI-COACH-VISION.md`

---

## Phase 4 — The Cutover (pick a low-traffic time)

1. [ ] Send clients heads-up message + screenshot of "Add to Home Screen" steps (24-48 hrs before)
2. [ ] Deploy code changes to Netlify
3. [ ] Set Netlify env var `URL=https://ziquecoach.com` (overrides fallbacks)
4. [ ] Make `ziquecoach.com` the primary domain in Netlify
5. [ ] Set `ziquefitnessnutrition.com` to 301 redirect to `ziquecoach.com`
6. [ ] Update Supabase Site URL
7. [ ] Activate new Stripe webhook, deactivate old
8. [ ] Smoke test golden paths:
   - [ ] New domain loads
   - [ ] Old domain redirects correctly
   - [ ] Login works
   - [ ] Coach invites client → email arrives from `noreply@ziquecoach.com` with correct links
   - [ ] Client signup → welcome email works
   - [ ] Client checkout flow → completes, redirects to right URL
   - [ ] Stripe webhook fires
   - [ ] Password reset email link resolves
9. [ ] Send "we're live" message to clients

---

## Phase 5 — Post-cutover

- [ ] Monitor Netlify function logs for URL/404 errors
- [ ] Monitor email deliverability (check spam folder for new sender)
- [ ] Watch Stripe for failed webhook deliveries
- [ ] Watch Supabase auth logs for failed redirects
- [ ] Update social media bios, business cards, email signatures
- [ ] Begin native app launch prep (Capacitor → App Store as Ziquecoach)
- [ ] In ~6 months: evaluate sunsetting old domain redirect

---

## Known issues to fix during the change

- The 3 different domain fallback variants in code (`ziquefitnessnutrition.com`, `ziquefitness.com`, possible typo `ziquefitnutrition.com`) — consolidate to one
- Master account email is hardcoded in 2 places — should be env var

## Key insight

Code changes can be done **ahead of DNS flip** (fallbacks don't affect live site since the Netlify `URL` env var controls actual routing). PWA homescreen saves WILL break for clients on the old domain unless redirected — native app solves this long-term.
