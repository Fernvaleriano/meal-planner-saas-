# Launch Checklist — Unfinished / Not Ready Items

*Generated 2026-03-13 — Full codebase audit*

---

## 1. CRITICAL — Capacitor Mobile Build is Broken

The `build:mobile` script (`package.json`) copies **legacy HTML/CSS/JS files** into `www/`:
```
"build:mobile": "rm -rf www && mkdir -p www/css www/icons www/js && cp *.html www/ && cp manifest.json www/ && cp sw.js www/ && cp -r css/* www/css/ && cp -r icons/* www/icons/ && cp -r js/* www/js/"
```

But the **actual React SPA** is built by Vite into `app-test-dist/`. The `capacitor.config.json` points `webDir` to `"www"`, which means **the native app would load the old legacy HTML pages, not the React app**.

**Fix needed:** Update `build:mobile` to run `vite build` and copy the SPA output into `www/`, or change `webDir` in `capacitor.config.json` to point to the Vite output directory. This is the #1 blocker for App Store / Play Store.

---

## 2. CRITICAL — No Push Notifications

- `android/app/build.gradle:77` mentions `google-services.json` for push notifications but the file doesn't exist
- No Firebase Cloud Messaging (FCM) setup
- No `@capacitor/push-notifications` plugin installed
- Google Play may reject the app for "not enough native functionality" without this (noted in your own `PLAY_STORE_RELEASE.md:157`)

**Fix needed:** Set up Firebase project, add `google-services.json`, install Capacitor push notifications plugin, wire up notification tokens to your existing `notifications` backend.

---

## 3. CRITICAL — App ID Mismatch (When Ready for Rebrand)

Current: `com.ziquefitness.mealplanner` (in `capacitor.config.json`, `build.gradle`)
Planned: `com.ziquecoach.app` (per CLAUDE.md)

**Note:** You said to skip branding this session, but be aware the App ID **cannot be changed** after publishing to Play Store / App Store. Decide the final App ID before your first submission.

---

## 4. HIGH — Inconsistent Domain Fallbacks (20+ files)

Three different domain variants are hardcoded as fallbacks across the codebase:

| Domain | Files |
|--------|-------|
| `ziquefitnessnutrition.com` | invite-client.js, email-service.js, create-checkout-session.js, stripe-webhook.js, reactivate-subscription.js, submit-apply-form.js, send-test-branding-email.js, send-workout-end-notifications.js, sync-all-exercise-videos.js |
| `ziquefitness.com` | create-billing-session.js, email-service.js (email addresses), pricing.html, terms.html, privacy.html, signup-success.html, subscription-required.html, capacitor.config.json hostname, gym-features.js, branding-settings.html |
| `ziquefitnutrition.com` (**typo**) | send-client-password-reset.js |

The typo in `send-client-password-reset.js:9` could cause password reset links to go to a dead domain if `process.env.URL` is not set.

---

## 5. HIGH — Service Worker Caches Legacy Pages

`sw.js` caches old HTML pages that no longer exist or are deprecated:
- `/portal.html` (redirected to `/app` in netlify.toml)
- `/client-dashboard.html`, `/client-diary.html`, `/client-favorites.html`, `/client-recipes.html`, `/client-settings.html`, `/client-checkin.html`, `/client-progress.html`, `/client-plans.html`, `/client-login.html` — these are all legacy pages
- `/styles/brand.css`, `/styles/coach-layout.css`, `/js/theme.js`, `/js/branding.js` — old CSS/JS

The service worker needs updating to cache the SPA's hashed Vite assets instead.

---

## 6. HIGH — 1,568 console.log Statements

There are **1,568** `console.log/warn/error/debug` calls across 217 files. Key offenders:

| File | Count |
|------|-------|
| `generate-meal-plan.js` | 204 |
| `Diary.jsx` | 46 |
| `Workouts.jsx` | 42 |
| `test-fixes.js` | 42 |
| `stripe-webhook.js` | 33 |
| `ExerciseDetailModal.jsx` | 34 |
| `scripts/sync-exercise-thumbnails.js` | 38 |
| `scripts/sync-all-exercises.js` | 32 |
| `AuthContext.jsx` | 24 |
| `generate-workout-claude.js` | 24 |
| `Plans.jsx` | 21 |
| `meal-image.js` | 22 |
| `Dashboard.jsx` | 18 |
| `food-diary.js` | 17 |
| `import-workout-program.js` | 17 |
| `Feed.jsx` | 16 |
| `analyze-nutrition-label.js` | 15 |

For production, the serverless functions can keep some logging (it goes to Netlify logs), but **client-side console.logs in .jsx files should be removed** to keep the browser console clean and avoid leaking debug info to users.

---

## 7. HIGH — No `.env.example` File

There is no `.env` or `.env.example` file. The codebase references these environment variables across functions, but there's no single source of truth for what's needed:

**Required env vars (found in code):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_BASIC` / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_PROFESSIONAL` / `STRIPE_PRICE_BRANDED`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `REPLICATE_API_TOKEN`
- `RESEND_API_KEY` or `SENDGRID_API_KEY` or (`MAILGUN_API_KEY` + `MAILGUN_DOMAIN`)
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`
- `ADMIN_EMAIL`
- `URL` (Netlify provides this automatically)
- `OPENAI_API_KEY` (openai is in dependencies)
- `FORM_NOTIFICATION_EMAIL`

**Fix needed:** Create a `.env.example` documenting all required vars so you don't forget anything when setting up production.

Also missing from the list above:
- `EDAMAM_APP_ID` + `EDAMAM_API_KEY` — used by `validate-nutrition.js` with **no fallback** (returns 500 if unset)
- `SPOONACULAR_API_KEY` — used by `spoonacular-recipes.js` with **no fallback**

---

## 8. HIGH — Stripe Price IDs May Not Be Set

`create-checkout-session.js` falls back to hardcoded `'price_starter_monthly'` strings if `STRIPE_PRICE_*` env vars aren't set. These hardcoded IDs almost certainly don't match your actual Stripe price objects, meaning **checkout would fail silently or create wrong subscriptions**.

Verify these env vars are set in Netlify:
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_GROWTH`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_BRANDED`

---

## 9. MEDIUM — `test-fixes.js` Debug File in Root

`test-fixes.js` (42 console.logs) is a test/debug script sitting in the project root. Should be removed or moved to a `scripts/` folder before publishing.

---

## 10. MEDIUM — Legacy HTML Pages (37 files) vs. React SPA (17 pages)

You have **37 HTML files** in the root (the old multi-page app) and **17 React JSX pages** (the new SPA). The Netlify redirects route `/app` to the SPA and some old URLs redirect to `/app`.

**Remaining questions:**
- Are all legacy HTML pages fully replaced by the React SPA? Or are some still actively used (like `signup.html`, `pricing.html`, `index.html` for marketing)?
- The signup/pricing/marketing pages appear to still be standalone HTML — confirm these are intentional and not half-migrated.

---

## 11. MEDIUM — Play Store Listing Assets Still Needed

Per your own `PLAY_STORE_RELEASE.md`, you still need:
- [ ] Feature Graphic (1024x500 PNG)
- [ ] Phone Screenshots (min 2, 1080x1920+)
- [ ] Tablet Screenshots (optional but recommended)
- [ ] Short Description finalized
- [ ] Full Description (up to 4000 chars)
- [ ] Privacy Policy hosted at a public URL (you have `privacy.html` but it references `ziquefitness.com`)
- [ ] Content Rating questionnaire completed
- [ ] Signing keystore created and backed up securely

---

## 12. MEDIUM — App Store (iOS) Setup Not Started

The `ios/` directory exists with a basic Capacitor scaffold, but:
- No App Store release guide equivalent to `PLAY_STORE_RELEASE.md`
- No mention of Apple Developer Account setup
- No code signing / provisioning profiles
- No App Store Connect listing preparation
- iOS-specific features (like requesting tracking permission for ATT if you use analytics) not addressed

---

## 13. MEDIUM — No Automated Tests

- Zero test files found in the project (no `*.test.js`, `*.spec.js`, `__tests__/` directories)
- No testing framework in dependencies (no jest, vitest, cypress, etc.)
- The `test-fixes.js` file is a manual debugging script, not an actual test suite

Not a hard blocker for launch, but means you're shipping without a safety net.

---

## 14. LOW — Stale SQL Migration Files in Root

Several `.sql` files are scattered in the project root (not in `supabase-migrations/`):
- `database-setup.sql`
- `database-clients.sql`
- `database-clients-expansion.sql`
- `database-client-accounts.sql`
- `database-client-intake-tokens.sql`
- `database-coach-plans.sql`
- `database-plan-status.sql`
- `database-shared-plans-link.sql`
- `database-add-plan-name.sql`
- `database-fix-coaches-rls.sql`
- `database-fix-coaches-complete.sql`
- `FIX-CLIENT-RLS-POLICY.sql`
- `FIX-COACHES-RLS-NOW.sql`

These appear to be one-off fixes that have likely already been run. Clean up before release to reduce confusion.

---

## 15. LOW — Spec/Design Docs Still in Repo

Files like `SPA-DASHBOARD-SPEC.md`, `SPA-DIARY-SPEC.md`, and `PLAY_STORE_RELEASE.md` are useful for development but shouldn't ship in the final app bundle. Consider adding to `.gitignore` or a `docs/` folder that's excluded from the build.

---

## 16. MEDIUM — ~30 Native `alert()` Calls Should Be Toast Notifications

Browser `alert()` and `window.confirm()` calls look bad in a native app wrapper. Found in:

| Page | alert() | confirm() |
|------|---------|-----------|
| `Progress.jsx` | 7 | 2 |
| `Plans.jsx` | 8 | 1 |
| `Recipes.jsx` | 8 | 0 |
| `Settings.jsx` | 5 | 1 |
| `CheckIn.jsx` | 2 | 0 |
| `Diary.jsx` | 0 | 2 |
| `Workouts.jsx` | 0 | 1 |
| `BrandingSettings.jsx` | 0 | 2 |
| `AskCoachChat.jsx` | 3 | 0 |

You already have a `Toast` component — these should use it instead. The `window.confirm()` calls should use a custom confirmation dialog.

---

## 17. LOW — WorkoutBuilder Language Dropdown Non-Functional

`WorkoutBuilder.jsx:97` — Language dropdown is hardcoded to "English" with state tracked but no actual language switching logic. Either remove it or wire it up.

---

## 18. MEDIUM — Deep Linking URL Schemes Not Declared

iOS `AppDelegate.swift` has URL handling code (lines 36-46) and supports Universal Links, but:
- **iOS**: No `URLTypes` section in `Info.plist` to register a custom URL scheme
- **Android**: No deep link intent filters in `AndroidManifest.xml` (only the basic MAIN/LAUNCHER filter)

Without this, the app can't handle `ziquecoach://` style links or respond to web-based deep links. Needed for things like email password-reset links opening directly in the app.

---

## Summary — Priority Order for This Weekend

### Must Fix Before Submitting to Stores
1. **Fix Capacitor build** — Make `build:mobile` / `cap:sync` use the Vite-built SPA, not legacy HTML files
2. **Fix the typo domain** in `send-client-password-reset.js` (`ziquefitnutrition.com` → correct domain)
3. **Verify Stripe price env vars** are set correctly in Netlify (hardcoded fallbacks won't match your actual Stripe prices)
4. **Decide final App ID** before first store submission (can't change later)
5. **Create signing keystore** for Android (if not done yet)

### Should Fix Before Launch
6. Remove client-side `console.log` from JSX files
7. Replace `alert()` / `window.confirm()` with Toast and custom dialogs
8. Update service worker to cache SPA assets
9. Set up push notifications (FCM/APNs)
10. Create `.env.example`
11. Clean up `test-fixes.js`
12. Set up deep linking URL schemes in iOS/Android configs

### Nice to Have
13. Clean up root SQL files
14. Remove/organize spec docs
15. Prepare store listing assets (screenshots, descriptions)
16. Set up basic testing
17. Resolve legacy HTML vs SPA page overlap
18. Fix or remove WorkoutBuilder language dropdown
