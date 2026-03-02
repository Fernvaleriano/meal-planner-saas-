# Zique Fitness Nutrition — App Store Submission Audit

**Date:** March 2, 2026
**Auditor:** Senior Technical Lead Review
**App:** Zique Fitness Nutrition v1.0.0
**Stack:** React 18 + Vite (SPA) → Capacitor 7 (iOS/Android) | Netlify Functions | Supabase | Stripe
**Bundle ID:** `com.ziquefitness.mealplanner`

---

## Executive Summary

The app is architecturally sound with strong foundations — solid auth flow, good dark mode theming, responsive layout, and well-structured Capacitor build tooling. However, there are **several blockers** that will cause rejection from both the Apple App Store and Google Play Store if not addressed. The most critical are: missing account deletion, missing iOS permission strings for camera/photo library access, no in-app links to Privacy Policy/Terms of Service, and no crash reporting for production monitoring.

Below is a **prioritized checklist** organized from most critical (store rejection blockers) to nice-to-have polish items.

---

## PRIORITY 1 — Store Rejection Blockers (Must Fix)

These items will cause **immediate rejection** from Apple and/or Google review.

### 1.1 Account Deletion (Apple Required, Google Required)

**Status: NOT IMPLEMENTED**

Both Apple (since June 2022) and Google (since December 2023) require that apps offering account creation must also provide a way for users to **delete their account from within the app**.

**Current state:** The Settings page (`src/pages/Settings.jsx`) has Profile, Preferences, Change Password, and Log Out — but **no account deletion option**.

**What needs to be built:**
- [ ] Add "Delete Account" button in Settings page with a destructive confirmation flow
- [ ] Create `netlify/functions/delete-my-account.js` that:
  - Deletes all user data (food diary, workout logs, progress photos, measurements, chat messages, check-ins)
  - Removes the user's `clients` row
  - Deletes their Supabase Auth account
  - Cleans up Supabase Storage files (profile photos, progress photos, etc.)
- [ ] Must authenticate the request (Bearer token) — user can only delete their own account
- [ ] Consider a 30-day grace period with re-activation option (mentioned in your Privacy Policy)

**Files to modify:**
- `src/pages/Settings.jsx` — add Delete Account UI
- `netlify/functions/` — new delete-my-account function
- Privacy Policy may need updating to match the implemented flow

---

### 1.2 iOS Permission Usage Description Strings (Apple Required)

**Status: MISSING CRITICAL PERMISSIONS**

The app uses camera and photo library (food photo logging, progress photos, profile photo upload in `src/pages/Settings.jsx`, `src/pages/Progress.jsx`, `src/pages/Diary.jsx`, `src/components/FoodModals.jsx`) but the `Info.plist` only has microphone and speech recognition strings.

**Missing in `ios/App/App/Info.plist`:**
- [ ] `NSCameraUsageDescription` — "Zique Fitness needs camera access to take photos of your meals and track your progress."
- [ ] `NSPhotoLibraryUsageDescription` — "Zique Fitness needs access to your photo library to upload meal photos and progress pictures."

**Currently present (good):**
- `NSMicrophoneUsageDescription` ✓
- `NSSpeechRecognitionUsageDescription` ✓

Apple **will reject** any app that accesses camera/photos without the appropriate usage description strings.

---

### 1.3 Privacy Policy & Terms of Service Accessible In-App (Apple Required, Google Required)

**Status: NOT LINKED IN THE APP**

Both stores require that Privacy Policy and Terms of Service be accessible **within the app itself**, not just on a website. The pages exist (`privacy.html`, `terms.html`) but there are **zero references to them** anywhere in the React SPA code.

**What needs to be done:**
- [ ] Add "Privacy Policy" and "Terms of Service" links in the Settings page (`src/pages/Settings.jsx`) under a new "Legal" section
- [ ] Links should open in an in-app browser or navigate to the web pages
- [ ] Both stores also require the privacy policy URL during submission — use `https://ziquefitnessnutrition.com/privacy.html`

---

### 1.4 iOS App Store Icon (1024x1024) (Apple Required)

**Status: NEEDS VERIFICATION**

- Current iOS icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (110KB, likely 1024x1024 — the @2x of 512pt = 1024px). This is likely fine.
- Current PWA icons in `icons/logo.png` is 500x500 — **not sufficient** for the iOS App Store submission which requires a separate 1024x1024 PNG without transparency.

**Action:**
- [ ] Verify the iOS icon is exactly 1024x1024 pixels, PNG format, no transparency, no rounded corners (Apple applies them automatically)
- [ ] The `Contents.json` in the appiconset must reference the correct file

---

### 1.5 Data Safety / App Privacy Section (Both Stores)

**Status: NEEDS PREPARATION**

Both stores require you to fill out detailed data collection and usage declarations during submission.

**For Apple App Store — App Privacy labels:**
- [ ] Declare: Contact Info (email, name), Health & Fitness (nutrition data, body measurements), Photos, Usage Data
- [ ] Declare that data is linked to the user's identity
- [ ] Declare third-party sharing: Stripe (payment), Supabase (hosting), AI services (anonymized nutrition data)

**For Google Play — Data Safety section:**
- [ ] Same declarations as above
- [ ] Must declare data encryption in transit (HTTPS — you have this ✓)
- [ ] Must declare account deletion mechanism (see 1.1 above)

---

## PRIORITY 2 — High Risk Issues (Fix Before Launch)

These won't cause immediate rejection but could trigger issues during review or in production.

### 2.1 CORS Configuration — Wildcard Origin

**Status: SECURITY CONCERN**

All Netlify functions use `Access-Control-Allow-Origin: '*'` (found in `netlify/functions/utils/auth.js` and across 70+ function files).

**Risk:** While this works for development, wildcard CORS means any website can make authenticated requests to your API if they have a user's token.

**Recommendation:**
- [ ] Restrict CORS to your actual domains: `https://ziquefitnessnutrition.com`, `https://app.ziquefitness.com`, and the Capacitor origin (`capacitor://localhost`, `https://app.ziquefitness.com`)
- [ ] Create a shared CORS config in `netlify/functions/utils/auth.js` with an allowed origins list

---

### 2.2 Crash Reporting — None Configured

**Status: NO CRASH REPORTING**

No Sentry, Bugsnag, Crashlytics, or any error reporting service is configured. In production, you'll be flying blind when users experience crashes.

**Recommendation:**
- [ ] Add Sentry (free tier available) for both the web/Capacitor frontend and Netlify functions
- [ ] The existing `ErrorBoundary` component (`src/components/ErrorBoundary.jsx`) already has `componentDidCatch` — add Sentry capture there
- [ ] Add global `window.onerror` and `window.onunhandledrejection` handlers

---

### 2.3 Rate Limiting — In-Memory Only

**Status: RESETS ON COLD START**

Rate limiting exists in several AI-powered functions (`generate-meal-plan.js`, `analyze-food-text.js`, `analyze-food-photo.js`, etc.) but it's implemented as in-memory JavaScript objects. Netlify Functions are stateless — these counters reset on every cold start.

**Risk:** A malicious user could repeatedly call expensive AI endpoints (Anthropic Claude, OpenAI) and run up significant API costs.

**Recommendation:**
- [ ] Implement persistent rate limiting using Supabase (track API call counts per user per time window)
- [ ] Or use Netlify's built-in rate limiting if available on your plan
- [ ] At minimum, add Supabase-backed rate limits to the AI endpoints

---

### 2.4 Hardcoded Supabase URL Fallbacks

**Status: MINOR CONCERN**

All 120+ Netlify functions contain the pattern:
```javascript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
```

This is a fallback, not a leak (the URL is public knowledge via the client-side code). However, it creates maintenance risk if you ever migrate Supabase projects.

**Recommendation:**
- [ ] Remove the fallback and require the `SUPABASE_URL` environment variable — this ensures you get a clear error rather than silently connecting to the wrong project
- [ ] Alternatively, centralize the config in `netlify/functions/utils/config.js`

---

### 2.5 Node.js Version Mismatch

**Status: INCONSISTENT**

- `.nvmrc` specifies Node 20
- `netlify.toml` specifies `NODE_VERSION = "18"`

**Recommendation:**
- [ ] Align both to Node 20 LTS (current LTS as of 2026), or at minimum Node 18 LTS
- [ ] Update `netlify.toml` → `NODE_VERSION = "20"`

---

### 2.6 trackClientActivity — Unauthenticated Endpoint

**Status: SECURITY CONCERN**

In `src/context/AuthContext.jsx` (line 13-26), the `trackClientActivity` function sends a `userId` via POST to `/.netlify/functions/track-client-activity` without including the Bearer token (uses plain `fetch` instead of the `apiPost` wrapper).

**Risk:** Anyone who knows a user ID could ping this endpoint to fake activity.

**Recommendation:**
- [ ] Switch to `apiPost` (which includes the Bearer token) or add the auth header manually
- [ ] Validate the token server-side in the function

---

## PRIORITY 3 — Production Polish (Recommended Before Launch)

### 3.1 Accessibility Improvements

**Current state:** 43 aria-label instances across 14 files — decent but incomplete.

**Gaps identified:**
- [ ] Add `aria-label` to all interactive elements in modals (`FoodModals.jsx` — only 2 instances in a 42KB file)
- [ ] Add `aria-live="polite"` to toast notifications so screen readers announce them
- [ ] Ensure all form inputs have associated `<label>` elements (several use placeholder text only)
- [ ] Add `role="alert"` to error messages in login/auth flows
- [ ] The ErrorBoundary component hardcodes dark theme colors instead of using CSS variables — won't work properly in light mode

---

### 3.2 App Icon Consistency

**Current state:** Display names vary across platforms:
- Android: "Zique Fitness Nutrition"
- iOS: "Zique Fitness"
- PWA manifest: "Zique Fitness Meal Planner"
- PWA short name: "Zique Fitness"

**Recommendation:**
- [ ] Standardize the display name. For store listings, shorter is better under the icon. Recommend "Zique Fitness" consistently.
- [ ] PWA manifest `icons` array uses `logo.png` at 500x500 — should be at least 512x512 for proper Android adaptive icon support

---

### 3.3 Android Permission Rationale Strings

**Status: MISSING**

While the web-based camera/photo picker may work through the WebView without explicit Android permissions, some Capacitor plugins require runtime permission declarations.

**Recommendation:**
- [ ] If using native camera via Capacitor Camera plugin, add `CAMERA` and `READ_MEDIA_IMAGES` to `AndroidManifest.xml`
- [ ] Test thoroughly on Android 13+ (API 33) where photo permissions changed (`READ_MEDIA_IMAGES` replaces `READ_EXTERNAL_STORAGE`)

---

### 3.4 Deep Linking / Universal Links

**Status: NOT CONFIGURED**

No deep linking or universal links are configured. For features like password reset emails, shared meal plans, or coach invitations, this means users are taken to a browser instead of the app.

**Recommendation:**
- [ ] Configure Android App Links in `AndroidManifest.xml` for `app.ziquefitness.com`
- [ ] Configure iOS Universal Links via `apple-app-site-association` file
- [ ] Configure Capacitor's App plugin to handle URL opens

---

### 3.5 Production Build Testing Checklist

Before submission, test these on **real devices** (not emulators):

- [ ] App launches without white screen (Capacitor WebView loads correctly)
- [ ] Login/logout flow works end-to-end
- [ ] Food photo capture works on both iOS and Android
- [ ] Voice logging (microphone + speech recognition) works
- [ ] Pull-to-refresh works on all pages
- [ ] Dark mode / light mode toggle works
- [ ] Push notifications work (if implemented)
- [ ] Back button behavior is correct on Android (doesn't exit app immediately)
- [ ] App resumes correctly after being backgrounded for 30+ minutes
- [ ] All API calls work over cellular (not just WiFi)
- [ ] Safe area insets display correctly on iPhone with Dynamic Island
- [ ] Keyboard doesn't cover input fields during data entry
- [ ] Large meal plans / workout programs scroll smoothly (no jank)

---

## PRIORITY 4 — Nice-to-Have Improvements

### 4.1 Haptic Feedback

No `navigator.vibrate()` or Capacitor Haptics plugin usage detected. Adding subtle haptic feedback on button presses, successful saves, and pull-to-refresh completion would make the app feel more native.

### 4.2 App Store Screenshots & Metadata

**Required assets for submission:**

| Asset | Apple App Store | Google Play Store |
|-------|----------------|-------------------|
| App Icon | 1024x1024 PNG (no alpha) | 512x512 PNG |
| Feature Graphic | — | 1024x500 PNG |
| Phone Screenshots | 6.7" (1290x2796), 6.5" (1284x2778), 5.5" (1242x2208) | 1080x1920+ (min 2, max 8) |
| Tablet Screenshots | 12.9" iPad (2048x2732) | 1920x1080+ (recommended) |
| App Preview Video | Optional (15-30s) | Optional |

### 4.3 In-App Purchases Consideration

**Current state:** Payments are handled entirely through Stripe (web-based checkout). This is fine for the coach/admin side, but be aware:

- **Apple's App Store rule:** If the app allows purchasing digital content or subscriptions, Apple requires you to use their In-App Purchase system and takes a 15-30% commission. Since this app's payment flow is coach-facing (coaches pay via web), and clients access the app for free, you may qualify as a "reader app" exemption or "business services" exemption.
- **Google Play:** Similar rules but slightly more lenient for B2B SaaS tools.
- [ ] Clearly document during review that the client app is free, and coach subscriptions are managed outside the app (web dashboard). The mobile app is a client-facing consumption experience, not a sales channel.

### 4.4 Offline Mode Enhancement

The service worker provides basic offline caching, but consider:
- [ ] Show a clear offline banner when network is unavailable
- [ ] Queue food diary entries for sync when connection returns
- [ ] Allow viewing cached meal plans and workout programs offline

### 4.5 Test Suite

**Status: NO TESTS**

No Jest, Vitest, or any testing framework is configured. While not a store requirement, having even basic smoke tests for critical flows (auth, API wrapper, food logging) would reduce risk of regressions before release.

---

## Build & Release Configuration Summary

### Android — Ready with Minor Items

| Item | Status | Notes |
|------|--------|-------|
| `applicationId` | ✓ | `com.ziquefitness.mealplanner` |
| `minSdkVersion` | ✓ | 23 (Android 6.0) |
| `targetSdkVersion` | ✓ | 35 (Android 15) — meets Google's requirement |
| `compileSdkVersion` | ✓ | 35 |
| `versionCode` | ✓ | 1 (first release) |
| `versionName` | ✓ | 1.0.0 |
| ProGuard/R8 | ✓ | Configured with Capacitor-specific keep rules |
| App Signing | ✓ | Environment variable based (keystore not in git) |
| Adaptive Icons | ✓ | All density buckets populated (mdpi → xxxhdpi) |
| Splash Screen | ✓ | Using `core-splashscreen` library |

### iOS — Needs Permission Strings

| Item | Status | Notes |
|------|--------|-------|
| Bundle ID | ✓ | Needs to be set in Xcode (`PRODUCT_BUNDLE_IDENTIFIER`) |
| Min iOS Version | ✓ | 14.0 (from Podfile) |
| App Icon | ✓ | 1024x1024 asset present |
| Splash Screen | ✓ | LaunchScreen.storyboard + splash images |
| Signing | ⚠ | Needs Apple Developer account + provisioning profile |
| Camera Permission | ✗ | **Must add** `NSCameraUsageDescription` |
| Photo Library Permission | ✗ | **Must add** `NSPhotoLibraryUsageDescription` |
| ATT (App Tracking) | N/A | No tracking SDKs detected — not needed |

---

## Prioritized Action Checklist

### Before You Can Submit (Blockers)
1. **Add account deletion** — Settings page UI + backend function
2. **Add iOS permission strings** — Camera + Photo Library in Info.plist
3. **Add Privacy Policy & Terms links** — In-app in Settings page
4. **Verify iOS app icon** — 1024x1024 PNG, no transparency
5. **Prepare App Privacy / Data Safety declarations** — For both store dashboards

### Before Going Live (High Priority)
6. **Fix CORS** — Restrict to your domains
7. **Add crash reporting** — Sentry integration
8. **Fix rate limiting** — Persistent storage (Supabase)
9. **Fix Node version mismatch** — Align .nvmrc and netlify.toml
10. **Fix unauthenticated trackClientActivity** — Add auth header

### Polish (Recommended)
11. **Improve accessibility** — aria-labels, form labels, screen reader support
12. **Standardize app display names** — Consistent across platforms
13. **Configure deep linking** — Universal Links + App Links
14. **Test on real devices** — Full checklist above
15. **Prepare store screenshots** — Required dimensions for both stores

### Optional Enhancements
16. Add haptic feedback
17. Enhance offline mode
18. Add basic test suite
19. Clarify IAP exemption for App Store review

---

*This audit is based on a complete codebase review as of March 2, 2026. All file references are relative to the project root.*
