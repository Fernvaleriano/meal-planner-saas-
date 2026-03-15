# Everything That Can Go Wrong — Deep Error Handling Analysis

**Date:** March 14, 2026
**Scope:** Full codebase audit — 166 Netlify functions, 50+ React components, service worker, Capacitor native app, Stripe integration, Supabase database
**Severity Ratings:** CRITICAL / HIGH / MEDIUM / LOW

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Authentication & Security Vulnerabilities](#2-authentication--security-vulnerabilities)
3. [Stripe & Payment Failure Modes](#3-stripe--payment-failure-modes)
4. [Database & Data Integrity Issues](#4-database--data-integrity-issues)
5. [API Route & Serverless Function Failures](#5-api-route--serverless-function-failures)
6. [Frontend State & Race Conditions](#6-frontend-state--race-conditions)
7. [PWA, Offline & Deployment Issues](#7-pwa-offline--deployment-issues)
8. [Domain Migration Risk Map](#8-domain-migration-risk-map)
9. [Master Risk Table](#9-master-risk-table)
10. [Prioritized Fix Plan](#10-prioritized-fix-plan)

---

## 1. Executive Summary

**Total issues found: 74**
- CRITICAL: 12
- HIGH: 21
- MEDIUM: 28
- LOW: 13

### The Five Worst Things That Will Bite You

1. **38 API functions (23% of your API surface) have ZERO authentication checks.** Anyone with a valid Supabase token can read/write ANY client's meal plans, workouts, water intake, chat messages, progress photos, and nutrition data. Your entire data model is exposed if a single RLS policy is misconfigured.

2. **Stripe webhooks have no idempotency protection.** When Stripe retries a webhook (which it does regularly), you'll create duplicate payment records, double-count revenue, and corrupt your accounting. There's no `stripe_webhook_events` table to track what's been processed.

3. **Payment succeeds in Stripe but database update fails = money taken, no record.** The webhook handler updates `coaches` table first, then `subscriptions` table second, with no transaction. If step 2 fails, you have a partial update with no rollback and no way to detect it automatically.

4. **Cancel/reactivate subscription has a race condition that creates DOUBLE subscriptions.** If Stripe is slow during reactivation, the code falls through to create a brand new subscription — so the coach gets billed twice.

5. **No Content Security Policy headers anywhere.** Combined with sensitive data cached unencrypted in localStorage (client health data, auth tokens, dietary restrictions), any XSS vulnerability gives an attacker everything.

---

## 2. Authentication & Security Vulnerabilities

### CRITICAL-AUTH-1: 38 Functions Have Zero Authentication

**Impact:** Complete data exposure for any authenticated user
**Files:** See complete list below

These functions accept `clientId` or `coachId` as parameters but **never verify the caller owns that ID**. They rely entirely on Supabase RLS as the sole defense — a single layer that bypasses entirely when using the service key (which all these functions do).

**Unprotected endpoints include:**
- `water-intake.js` — Read/write any client's water intake
- `food-diary.js` — Read/write any client's food diary
- `meal-plans.js` — Read any client's meal plans
- `chat.js` — Send messages as any user, read any conversation
- `coach-activity-feed.js` — View all of any coach's client activities
- `upload-meal-photo.js` — Upload files without any authentication at all
- `save-checkin.js`, `delete-checkin.js` — Manipulate any client's check-ins
- `client-workout-log.js` — Read/write any client's workouts
- `coach-workout-feed.js` — View any coach's client workout data
- `client-challenges.js`, `client-daily-wins.js` — Access any client's challenges
- `comment-on-diary-entry.js` — Comment on any diary entry
- `coach-ai-assistant.js` — Use AI assistant as any coach
- `client-measurements.js` — Read/write any client's body measurements
- `upload-progress-photo.js` — Upload photos for any client
- Plus 20+ more functions

**Attack example:**
```javascript
// Attacker is logged in as ANY user, knows a victim's client UUID
fetch('/.netlify/functions/food-diary?clientId=VICTIM_UUID', {
  headers: { 'Authorization': 'Bearer ATTACKER_TOKEN' }
});
// Returns victim's complete food diary — no ownership check
```

### CRITICAL-AUTH-2: Chat Message Impersonation

**File:** `chat.js`

The chat endpoint doesn't verify that the `senderType` matches the actual user. A client can send:
```json
{
  "coachId": "coach-uuid",
  "clientId": "their-client-uuid",
  "senderType": "coach",
  "message": "Your plan has been updated, click here..."
}
```
The message appears to come **from the coach**. Social engineering / phishing attack vector.

### CRITICAL-AUTH-3: Overly Permissive Anonymous Coach Signup RLS Policy

**File:** `docs/sql-archive/FIX-COACHES-RLS-NOW.sql`
```sql
CREATE POLICY "anon_insert_signup" ON coaches FOR INSERT TO anon WITH CHECK (true);
```
Any anonymous user can create coach records directly via the Supabase API, bypassing all signup validation, email verification, and payment requirements.

### HIGH-AUTH-4: No Rate Limiting on 160+ Endpoints

Rate limiting utilities exist in `auth.js` but are only used on `analyze-food-photo.js` (20/min). Everything else is unlimited:
- Chat bulk-send: Send to unlimited clients in one call
- Form submissions: Unlimited spam
- File uploads: Unlimited storage consumption
- AI operations: Unlimited Claude API cost ($0.008+ per call, uncapped)

The rate limiter is also in-memory only — resets on every Netlify function cold start (effectively useless).

### HIGH-AUTH-5: Sensitive Data Cached Unencrypted in localStorage

`AuthContext.jsx` caches full client profiles in `localStorage.cachedClientData`:
- Email, phone, age, gender, weight, height
- Activity level, dietary restrictions, allergies
- Health goals, food preferences
- Coach relationship data

Any XSS attack steals all of this instantly. No encryption, no expiry, no clearance guarantee.

### HIGH-AUTH-6: CORS Wide Open

Every single function returns `Access-Control-Allow-Origin: *`. Any website can make authenticated requests to your API if they can obtain a token.

### MEDIUM-AUTH-7: No Email Verification on Account Creation

Both coach and client accounts are auto-confirmed (`email_confirm: true`). No email ownership verification step. Typos in email addresses go undetected.

### MEDIUM-AUTH-8: Password Requirements Too Weak

Only requirement: 6+ characters. "111111" is accepted. NIST recommends minimum 12 characters.

---

## 3. Stripe & Payment Failure Modes

### CRITICAL-PAY-1: Payment Succeeds, Database Update Fails (Unrecoverable)

**File:** `stripe-webhook.js` lines 197-232

Webhook handler updates `coaches` table first, then `subscriptions` table second. No transaction wrapping. If step 2 fails:
- `coaches.subscription_status = 'active'` (committed)
- `subscriptions` table: NOT UPDATED (failed)
- Stripe: Payment collected successfully
- No automated recovery path
- No alert to admin

The subscriptions table upsert has **no error handling** — it's fire-and-forget:
```javascript
await supabase.from('subscriptions').upsert({...}, { onConflict: 'coach_id' });
// ^ NO error check. Silent failure.
```

### CRITICAL-PAY-2: No Webhook Idempotency (Duplicate Processing)

**File:** `stripe-webhook.js`

No check for previously processed events. When Stripe retries (network glitch, slow response, timeout):
- Same `checkout.session.completed` processed twice
- Payment records created twice in `client_payments`
- Revenue double-counted
- No `stripe_webhook_events` table exists

Every webhook handler runs unconditionally every time. Missing:
```javascript
// THIS CODE DOES NOT EXIST:
const { data: existing } = await supabase
  .from('stripe_webhook_events')
  .select('id')
  .eq('event_id', stripeEvent.id).single();
if (existing) return { statusCode: 200 }; // Already handled
```

### CRITICAL-PAY-3: Reactivation Creates Double Subscriptions

**File:** `reactivate-subscription.js` lines 98-144

If Stripe is slow or partially fails during reactivation:
1. `stripe.subscriptions.retrieve()` succeeds
2. `stripe.subscriptions.update()` times out
3. Error caught — falls through to create NEW subscription
4. Coach now has TWO active subscriptions in Stripe
5. Double-billed every month

### CRITICAL-PAY-4: Cancel Subscription Race Condition

**File:** `cancel-subscription.js` lines 156-177

Stripe cancellation runs first, database update runs second. If database update fails:
- Stripe: subscription canceled
- Database: still shows `active`
- Coach sees "Your subscription is active" but Stripe says canceled
- No reconciliation mechanism

### HIGH-PAY-5: Webhooks Out of Order Corrupt Status

Stripe may deliver events out of order. Each webhook handler overwrites `subscription_status` with the event's status. If `invoice.payment_succeeded` arrives before `checkout.session.completed`, status toggles unpredictably. No mechanism to query Stripe for the actual current status.

### HIGH-PAY-6: Trial Period Mismatch

If Stripe API is slow during webhook processing, trial end date calculation fails silently — `trialEndsAt` becomes `undefined`, stored as NULL. Actual Stripe trial continues. Database and Stripe disagree on when trial ends.

### HIGH-PAY-7: Connect Webhook Missing Error Handling

**File:** `stripe-connect-webhook.js` lines 101-164

`handleCheckoutComplete` has no error handling on the database upsert. Client charged but subscription never created in database. Missing metadata silently returns without logging.

### HIGH-PAY-8: No Refund Tracking

No handler for `charge.refunded` webhook event. When refunds happen in Stripe, `client_payments` still shows `status: 'succeeded'`. Revenue reports wrong. Tax records wrong.

### MEDIUM-PAY-9: Promo Code Usage Never Incremented

`stripe-connect-webhook.js` never updates `times_used` on `coach_promo_codes` table. Usage counter always stays at 0. Max redemption limits not enforced at database level (Stripe enforces its own, but they're out of sync).

### MEDIUM-PAY-10: No Failed Payment Notification

`handlePaymentFailed` updates status to `past_due` but sends no email. Coach's card expires, payment fails silently, coach suddenly locked out days later with no warning.

### MEDIUM-PAY-11: Concurrent Subscribe Button Clicks

`ClientBilling.jsx` sets `actionLoading` but button checks `loading` (different flag). Two simultaneous checkout sessions created. One abandoned, one completed. Hanging Stripe sessions.

### MEDIUM-PAY-12: No Circuit Breaker on Stripe API

All Stripe calls have no timeout configuration. Default Stripe SDK timeout: ~25 seconds. Netlify function timeout: 26 seconds. During Stripe outage, all payment operations hang until timeout, then fail with generic error. No retry, no backoff, no graceful degradation.

### MEDIUM-PAY-13: Webhook Timeout Kills Email Delivery

Welcome emails sent synchronously in webhook handler. Email service takes 8+ seconds. Combined with database updates, can exceed 26-second Netlify timeout. Function killed mid-email. Database updated but email never sent. Stripe retries webhook, runs everything again (no idempotency).

---

## 4. Database & Data Integrity Issues

### CRITICAL-DB-1: Race Condition in Calorie Goals (TOCTOU)

**File:** `calorie-goals.js` lines 154-225

Check-then-insert pattern without transaction:
```javascript
const { data: existing } = await supabase.from('calorie_goals')
  .select('id').eq('client_id', clientId).single();
// RACE WINDOW: Another request inserts here
if (!existing) {
  await supabase.from('calorie_goals').insert([{...}]);
  // FAILS: unique constraint violation
}
```
Two concurrent requests both see `existing = null`, both try to insert, one fails with 500 error.

### CRITICAL-DB-2: Overly Permissive Form Response RLS

```sql
CREATE POLICY "Anyone can submit form responses" ON form_responses
FOR INSERT WITH CHECK (true);
```
Anyone can insert garbage into form_responses — no validation of `form_template_id`, no rate limiting, no schema validation on the JSONB `response_data`.

### HIGH-DB-3: Auth User Orphaned From Client Record

**File:** `create-client.js` lines 161-192

Auth user created before client record. If client insert fails (network, constraint, RLS), auth user exists with no matching client record. No rollback. Orphaned accounts accumulate over time.

### HIGH-DB-4: Archive Operation: 11 Sequential Deletes Without Transaction

**File:** `archive-client.js` lines 79-152

Deletes from 11 tables sequentially. If delete #5 fails, deletes #1-4 already committed. No rollback. Orphaned data in remaining tables. Inconsistent database state.

### HIGH-DB-5: No Input Validation on Nutritional Data

**File:** `calorie-goals.js`

`calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal` accepted without range validation. Can store negative calories, 999999g protein. No database-level CHECK constraints.

### HIGH-DB-6: JSONB Arrays Not Validated

**File:** `create-client.js`

`allergies`, `disliked_foods`, `preferred_foods`, `cooking_equipment` accept any JSON structure. Could contain objects, numbers, null, or HTML/JavaScript strings for stored XSS:
```javascript
{ allergies: ["peanuts", "<script>alert('xss')</script>", null, 12345] }
```

### HIGH-DB-7: N+1 Query Pattern in RLS Policies

15+ tables use subquery-based RLS:
```sql
CREATE POLICY "..." ON food_diary_entries FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
```
Subquery executes per-row. 1000 diary entries = 1000 subqueries. Should use `EXISTS` instead.

### MEDIUM-DB-8: Schema Information Leaked in Error Messages

Error responses include raw Supabase error messages:
```json
{ "error": "Failed to create client",
  "details": "Duplicate key value violates unique constraint 'clients_email_key'" }
```
Exposes table names, column names, constraint names. Aids attackers in mapping schema.

### MEDIUM-DB-9: Integer/Bigint Type Mismatch

`clients.id` is BIGSERIAL (64-bit) but foreign keys in `food_diary_entries`, `calorie_goals` reference it as INTEGER (32-bit). Silent truncation risk if IDs exceed 2.1 billion. Causes type cast overhead.

### MEDIUM-DB-10: Historical UUID Mismatch Evidence

`fix-coach-uuid-mismatch.sql` shows prior incident where auth.users UUID didn't match coaches table UUID. Required manual migration across 25+ tables. Risk of recurrence exists in current signup flow.

### LOW-DB-11: No Audit Trail on Deletions

All delete operations are permanent. No soft-delete pattern (except `archive-client.js`). No record of who deleted what, when. Can't recover accidental deletions. No compliance trail.

### LOW-DB-12: Email Format Not Validated

`create-client.js` checks `if (!email)` but doesn't validate format. `"not-an-email"` stored successfully. Downstream email delivery fails silently.

---

## 5. API Route & Serverless Function Failures

### CRITICAL-API-1: upload-meal-photo.js Has ZERO Authentication

Completely unauthenticated file upload endpoint. Anyone can:
- Upload arbitrary files to your Supabase storage
- Fill storage quota
- Upload malicious SVG (XSS vector)
- No file type whitelist validation

### CRITICAL-API-2: No Request Size Validation

Netlify limit: 6MB per request. No functions validate `event.body.length`. An attacker can:
- Send 6MB chat messages
- Upload maximum-size files repeatedly
- Send massive JSON payloads to form endpoints
- DoS via storage exhaustion

### HIGH-API-3: Silent Email Failures Everywhere

5+ functions catch email sending errors and continue as if successful:
```javascript
try { await sendWelcomeEmail({...}); }
catch (emailError) {
  console.error('Error:', emailError);
  // RETURNS SUCCESS ANYWAY
}
```
Users never receive welcome emails, password resets, intake invitations, or cancellation confirmations — and the system reports success.

### HIGH-API-4: No Timeout Wrappers on AI Operations

Only `meal-plans.js` uses `withTimeout()`. All other AI endpoints run without protection:
- `analyze-food-photo.js` — Claude API, 5-8 seconds
- `generate-meal-plan.js` — Heavy AI processing (302KB file)
- `coach-workout-ai.js` — AI workout generation
- `ai-activity-summary.js` — AI summaries

These can exceed the 10/26-second Netlify timeout. Function killed mid-execution, partial data written, user gets no response.

### HIGH-API-5: get-signed-urls.js Ownership Bypass

Ownership verification is conditional. If you omit `clientId`, no ownership check runs at all:
```javascript
if (clientId && coachId) { /* check ownership */ }
// No clientId = no check = access any coach's files
```

### HIGH-API-6: Bulk Chat Send No Array Length Limit

`chat.js` bulk-send accepts `clientIds` array with no maximum length. Can send to unlimited clients in one call. Creates unlimited notification records. Can overwhelm email provider.

### MEDIUM-API-7: Inconsistent Error Response Formats

Some functions return plain text, some return JSON. Some include CORS headers, some don't. Some return 400 for auth errors (should be 401). Some return raw Supabase errors (information disclosure). No error code system for frontend handling.

### MEDIUM-API-8: Service Key Used Everywhere (RLS Bypassed)

All 166 functions create Supabase client with `SUPABASE_SERVICE_KEY`, which has unrestricted admin access. This bypasses all RLS policies. Functions must implement their own access control — and 38 of them don't.

### MEDIUM-API-9: No File Type Validation on Uploads

All upload endpoints accept base64 without MIME type whitelisting. SVG uploads could contain JavaScript (XSS). No content-type verification beyond regex matching.

### MEDIUM-API-10: Hardcoded Supabase URL in 90+ Functions

Pattern: `process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co'`. If env var not set, entire system falls back to hardcoded URL. Makes Supabase migration impossible without touching 90+ files.

---

## 6. Frontend State & Race Conditions

### HIGH-FE-1: Stale Closure in Token Refresh

**File:** `src/utils/api.js`

Token refresh is non-blocking — returns potentially-expiring token immediately while refresh happens in background:
```javascript
if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
  refreshSession();  // Non-blocking, fire-and-forget
  return sessionCache.session.access_token;  // Returns about-to-expire token
}
```
Subsequent API calls may use expired token, get 401, then retry — causing visible errors and data loss if writes were in flight.

**Bright spot:** `api.js:141-195` has excellent promise coalescing that prevents concurrent refresh calls — the session refresh itself is well-implemented, just the pre-emptive return is risky.

### HIGH-FE-2: Error Boundary Exists But Insufficient

**File:** `src/components/ErrorBoundary.jsx`

An `ErrorBoundary` component exists and is used in `Layout.jsx:113`, but:
- Only catches render-phase errors (not event handlers or async operations)
- Logs to `console.error` only — no error telemetry (Sentry, LogRocket, etc.)
- No granular recovery per component section
- Single boundary wraps entire app — one crash = full white screen

### HIGH-FE-3: FoodModals Double-Submit with No Timeout Reset

**File:** `src/components/FoodModals.jsx:181-240`

Uses `isAddingRef.current` toggle to prevent duplicate form submissions, but **no timeout reset** if API hangs:
```javascript
const addAllTooDiary = useCallback(async () => {
  if (!results || !clientData?.id || isAddingRef.current) return;
  isAddingRef.current = true;
  setIsAdding(true);
  try {
    const logPromises = foodsToAdd.map((food, idx) =>
      apiPost('/.netlify/functions/food-diary', { ... })
    );
    await Promise.all(logPromises);
  } finally {
    isAddingRef.current = false; // Only resets after completion
  }
}, [programId, clearDraft, saveDraft]);
```
If network timeout (15s from `FETCH_TIMEOUT_MS`) occurs, user cannot add foods again until page reload. Silent failure — no error message shown.

### HIGH-FE-4: Messages Optimistic Update ID Collision

**File:** `src/pages/Messages.jsx:284-313`

Optimistic message IDs use `Date.now()` which can collide in rapid submissions:
```javascript
const optimisticId = `optimistic-${Date.now()}`;
```
If two messages sent within 1-2ms, IDs match. Deduplication logic `prev.some(m => m.id === newMsg.id)` returns wrong result — duplicate messages appear or real messages get swallowed.

**Fix:** Use `crypto.randomUUID()` or `Date.now()-${Math.random()}`.

### MEDIUM-FE-5: Supabase Realtime Channel Cleanup Race

**File:** `src/pages/Messages.jsx:556-705`

`removeChannel()` is async but cleanup doesn't await it:
```javascript
return () => {
  supabase.removeChannel(channel); // NOT awaited
};
```
New effect may run immediately while old channel is still being torn down → duplicate message handlers → messages processed twice.

**Partial mitigation in code:** Channel name includes `resubscribeKey` counter to avoid collision, but brief overlap still possible.

### MEDIUM-FE-6: Subscription Status Not Checked Mid-Session

Subscription status fetched once on page load. If subscription expires or is canceled during a session (via Stripe webhook), user continues using premium features until they refresh. No realtime subscription status check on API calls.

### MEDIUM-FE-7: Cached Data Staleness Invisible to User

Service worker serves stale cached data with no visual indicator. User sees "Meal Plan: Chicken & Rice" but it could be from last week's cache. No timestamp, no "last updated" badge, no stale data warning.

### MEDIUM-FE-8: localStorage Cache Never Expires + Tampering Risk

`cachedClientData` persists indefinitely in localStorage. Multiple risks:
- **No TTL:** If user logs out, cached data (health info, meal plans) still accessible
- **No encryption:** Sensitive client data stored in plaintext
- **No integrity checks:** Malicious scripts could modify cached meal plans, settings, check-in history
- **Affected files:** `Plans.jsx:40`, `Diary.jsx:22-24`, `Messages.jsx:22-24`, `BrandingContext.jsx:90-97`, `Login.jsx:15`
- **Mitigation:** Server-side validation on submission (appears implemented)

### MEDIUM-FE-9: Feed Comment Submission Hangs Silently

**File:** `src/pages/Feed.jsx:110-137`

No timeout on comment submission; no user-facing error on failure:
```javascript
} catch (err) {
  console.error('Error adding comment:', err);
  // No user-facing error message — comment silently fails
}
```
Comment button appears stuck for 15s on slow networks with no feedback.

### MEDIUM-FE-10: Resume Timeout Too Short for iOS

`SESSION_REFRESH_TIMEOUT = 6000` (6 seconds) but iOS PWA HTTP connections can hang 20-30 seconds during app resume. Premature timeout falls back to potentially-invalid cached token.

**Bright spot:** `useAppLifecycle.js` has excellent non-blocking resume pattern with heartbeat timer fallback for iOS Safari PWA (which doesn't fire `visibilitychange` consistently).

### MEDIUM-FE-11: Branding URL Injection

**File:** `src/context/BrandingContext.jsx:120-194`

Coach-provided URLs used without validation:
```javascript
const logoUrl = brandingData?.brand_logo_url || DEFAULT_LOGO;
// Used as: <img src={logoUrl} />
```
Coach branding URLs could redirect to unexpected destinations. Low risk for images (no XSS via `<img src>`), but CSS custom properties from coach data applied directly to document root.

### LOW-FE-12: No Offline Queue for Writes

When offline, all write operations fail immediately. No queue to retry when connectivity returns. User loses work (typed meal plans, logged workouts, chat messages).

**Bright spot:** Workout autosave (`useWorkoutAutosave.js`) is gold-standard — two-layer protection with localStorage drafts + DB periodic saves, `beforeunload` handler, and stale draft cleanup. This pattern should be extended to other write-heavy features.

### LOW-FE-13: BrandingContext useCallback Inefficiency

**File:** `src/context/BrandingContext.jsx:296-303`

Callbacks memoized but `terminology` dependency changes frequently, defeating memoization. Performance issue, not correctness.

### Architecture Bright Spots (Frontend)

Things done well that should be preserved:
- **Session refresh promise coalescing** (`api.js:141-195`) — prevents concurrent refresh calls
- **401/403 auto-retry with token refresh** (`api.js:272-313`) — stale tokens handled transparently
- **Diary optimistic UI with cache-first rendering** (`Diary.jsx:60-82`) — instant load from cache, background refresh
- **Workout autosave two-layer pattern** (`useWorkoutAutosave.js`) — survives tab close, browser crash
- **Messages optimistic message merging** (`Messages.jsx:124-151`) — deduplicates by ID, falls back to content matching, handles replication lag
- **Protected routes** (`App.jsx:25-54`) — proper auth checks with loading states
- **Non-blocking app resume** (`useAppLifecycle.js:98-160`) — solves iOS freeze issue
- **No `dangerouslySetInnerHTML`** — zero instances found in entire codebase (XSS safe)

---

## 7. PWA, Offline & Deployment Issues

### CRITICAL-PWA-1: No CSP Headers Anywhere

No Content-Security-Policy in `netlify.toml` or HTML meta tags. Any script from any source can execute. Combined with localStorage containing auth tokens and health data, XSS = complete account takeover.

### CRITICAL-PWA-2: Manual Cache Versioning (No Auto-Invalidation)

**File:** `sw.js`

Cache names hardcoded: `zique-fitness-v14`, `zique-data-v11`. Must manually increment on every deploy. If forgotten, users permanently serve stale code. iOS PWA may take days to detect SW update.

### HIGH-PWA-3: Static Asset Cache Too Aggressive

`netlify.toml` sets JS/CSS to `max-age=31536000, immutable` (1 year, never revalidate). Only safe if Vite hashes filenames. If build produces `app.js` (same name each deploy), users never get updates.

### HIGH-PWA-4: HTML Cache Too Long

HTML files cached for 1 hour (`max-age=3600`). After deploy, users see old HTML for up to 1 hour. In a PWA homescreen save, user may never manually refresh.

### HIGH-PWA-5: Capacitor App ID Change Requires New App Store Submission

Current: `com.ziquefitness.mealplanner`. Planned: `com.ziquecoach.app`. Changing bundle ID requires a completely new App Store / Play Store listing. Not an update — a new app. Users don't automatically migrate.

### HIGH-PWA-6: No App Version Detection

No mechanism for the app to know a new version has been deployed. No `/version.json` endpoint. No version comparison. No "Update available" prompt. Users can run stale code indefinitely.

### MEDIUM-PWA-7: client-feed.html Excluded from Cache

Hardcoded `cache: 'no-store'` for client-feed. Returns 503 when offline with no graceful degradation. User loses access to entire feed offline.

### MEDIUM-PWA-8: Push Notifications Skeleton Only

Service worker has push event handlers but:
- No `Notification.requestPermission()` call anywhere
- No `PushManager.subscribe()` implementation
- No server-side push sending function
- Notifications will never work

### MEDIUM-PWA-9: No HSTS Headers

HTTP Strict-Transport-Security not configured. Protocol downgrade attacks possible.

### MEDIUM-PWA-10: No SRI for CDN Resources

Third-party CDN resources (Supabase, Chart.js, jsPDF, Lucide) loaded without Subresource Integrity hashes. Compromised CDN could inject malicious code.

### LOW-PWA-11: iOS localStorage Quota

iOS PWA: 5-10 MB localStorage limit. Large cached datasets may not fit. Session storage cleared on close. No quota checking before writes.

---

## 8. Domain Migration Risk Map

### Files Requiring Updates: 25+

**Netlify Functions (14 files)** — use `process.env.URL || 'https://ziquefitnessnutrition.com'`:
- `client-checkout.js`, `client-subscription-manage.js`, `create-billing-session.js`
- `create-checkout-session.js`, `gym-features.js`, `invite-client.js`
- `reactivate-subscription.js`, `send-client-password-reset.js`
- `send-test-branding-email.js`, `send-workout-end-notifications.js`
- `stripe-connect-onboarding.js`, `stripe-webhook.js`, `submit-apply-form.js`
- `utils/email-service.js` (5 references)

**Configuration (3 files):**
- `capacitor.config.json` — hostname + app name
- `android/app/build.gradle` — app ID
- `ios/App/App/Info.plist` — app ID + URL schemes

**Static HTML (7 files):**
- `index.html`, `pricing.html`, `privacy.html`, `terms.html`
- `subscription-required.html`, `signup-success.html`, `branding-settings.html`

**Email Domain Inconsistency:**
- `email-service.js` → `noreply@ziquefitness.com` (not ziquefitnessnutrition.com)
- `submit-apply-form.js` → `contact@ziquefitness.com`

### What Breaks on Day 1 of Domain Switch

1. **Stripe webhooks stop working** — Must update webhook URL in Stripe dashboard
2. **OAuth redirects fail** — Must update Supabase redirect URLs
3. **PWA homescreen saves break** — Old domain shortcuts stop working
4. **Deep links break** — `ziquefitness://` scheme in native app doesn't resolve
5. **Email links point to old domain** — Until env vars updated
6. **App Store requires new submission** — If changing bundle ID

---

## 9. Master Risk Table

| # | Issue | Severity | Category | Auto-Recovery |
|---|-------|----------|----------|---------------|
| 1 | 38 API functions unauthenticated | CRITICAL | Auth | No |
| 2 | No webhook idempotency | CRITICAL | Payments | No |
| 3 | Payment succeeds, DB fails | CRITICAL | Payments | No |
| 4 | Reactivation double-subscription | CRITICAL | Payments | No |
| 5 | Cancel subscription race condition | CRITICAL | Payments | No |
| 6 | Chat message impersonation | CRITICAL | Auth | No |
| 7 | Anonymous coach signup RLS | CRITICAL | Auth/DB | No |
| 8 | Unauthenticated file upload | CRITICAL | API | No |
| 9 | No CSP headers | CRITICAL | Security | No |
| 10 | TOCTOU race in calorie goals | CRITICAL | DB | Partial |
| 11 | No request size validation | CRITICAL | API | No |
| 12 | Permissive form response RLS | CRITICAL | DB | No |
| 13 | No rate limiting (160+ endpoints) | HIGH | Auth | No |
| 14 | Sensitive data in localStorage | HIGH | Auth | No |
| 15 | CORS wide open | HIGH | Auth | No |
| 16 | Webhooks out of order | HIGH | Payments | Partial |
| 17 | Trial period mismatch | HIGH | Payments | Partial |
| 18 | Connect webhook no error handling | HIGH | Payments | No |
| 19 | No refund tracking | HIGH | Payments | No |
| 20 | Auth user orphaned from client | HIGH | DB | No |
| 21 | Archive 11 deletes no transaction | HIGH | DB | No |
| 22 | No input validation on nutrition | HIGH | DB | No |
| 23 | JSONB arrays not validated | HIGH | DB | No |
| 24 | N+1 query in RLS policies | HIGH | DB | N/A |
| 25 | Silent email failures | HIGH | API | No |
| 26 | No timeout on AI endpoints | HIGH | API | No |
| 27 | get-signed-urls ownership bypass | HIGH | API | No |
| 28 | Bulk send no array limit | HIGH | API | No |
| 29 | Stale closure in token refresh | HIGH | Frontend | Partial |
| 30 | Error boundary exists but insufficient | HIGH | Frontend | No |
| 31 | FoodModals double-submit no timeout reset | HIGH | Frontend | No |
| 32 | Optimistic message ID collision (Date.now) | HIGH | Frontend | No |
| 33 | Static asset cache too aggressive | HIGH | PWA | No |
| 34 | HTML cache too long | HIGH | PWA | No |
| 35 | App ID change = new store listing | HIGH | PWA | No |
| 36 | No app version detection | HIGH | PWA | No |
| 37 | Supabase channel cleanup race | MEDIUM | Frontend | Partial |
| 38 | Feed comment silent failure | MEDIUM | Frontend | No |
| 39 | Branding URL injection | MEDIUM | Frontend | No |
| 40 | localStorage tampering risk | MEDIUM | Frontend | Partial |
| 41-74 | (See MEDIUM/LOW items above) | MED/LOW | Various | Various |

---

## 10. Prioritized Fix Plan

### TIER 1: Fix Before You Sleep Well (CRITICAL — this week)

1. **Add authentication to all 38 unprotected functions**
   - Each function needs `authenticateClientAccess()` or `authenticateCoach()` call
   - Pattern already exists in codebase — just not applied everywhere
   - Estimated: 2-3 hours of repetitive but critical work

2. **Implement webhook idempotency**
   - Create `stripe_webhook_events` table
   - Check event ID before processing
   - Insert after successful processing
   - Estimated: 1-2 hours

3. **Fix cancel/reactivate race conditions**
   - Update database FIRST, call Stripe SECOND
   - Add guard against double-subscription creation
   - Estimated: 2 hours

4. **Add CSP headers to netlify.toml**
   - Block unauthorized script execution
   - Protect localStorage from XSS
   - Estimated: 30 minutes

5. **Fix chat impersonation**
   - Verify `senderType` matches authenticated user's actual role
   - Estimated: 30 minutes

### TIER 2: Fix Before Production Traffic (HIGH — next 2 weeks)

6. **Add webhook transaction semantics** — Wrap coaches + subscriptions updates
7. **Add request size validation** — Check `event.body.length` on all endpoints
8. **Add file type whitelisting** — Reject SVG, allow only jpeg/png/webp/gif
9. **Add timeout wrappers** — All AI endpoints need `withTimeout(8500)`
10. **Fix form response RLS** — Require valid form_template_id
11. **Improve error boundaries** — Add error telemetry, granular recovery per section
12. **Fix FoodModals submission** — Add timeout wrapper + reset logic to prevent permanent lock
13. **Fix optimistic message IDs** — Use `crypto.randomUUID()` instead of `Date.now()`
14. **Restrict CORS** — Whitelist known domains instead of `*`
13. **Add rate limiting** — At minimum on auth, upload, AI, and chat endpoints
14. **Fix signed URL ownership bypass** — Require clientId for all requests
15. **Add failed payment notifications** — Email on `invoice.payment_failed`
16. **Add refund tracking** — Handle `charge.refunded` webhook

### TIER 3: Fix Before Domain Migration (MEDIUM — next month)

17. **Consolidate domain references** — Single env var, no hardcoded fallbacks
18. **Fix email domain inconsistency** — `ziquefitness.com` vs `ziquefitnessnutrition.com`
19. **Add app version detection** — `/version.json` + periodic check + update prompt
20. **Reduce HTML cache time** — 5 minutes instead of 1 hour
21. **Add HSTS headers**
22. **Add SRI for CDN resources**
23. **Fix archive transaction** — Use database stored procedure
24. **Add input validation** — Nutrition values, email format, JSONB arrays
25. **Sanitize error messages** — Map to generic codes, hide schema details

### TIER 4: Operational Excellence (LOW — ongoing)

26. **Implement audit logging** — Track all mutations
27. **Add monitoring/alerting** — Webhook failures, payment failures, error rates
28. **Build Stripe reconciliation tool** — Daily compare DB vs Stripe
29. **Implement offline write queue** — Queue writes when offline, sync on reconnect
30. **Add push notification infrastructure** — Complete the skeleton implementation
31. **Optimize RLS policies** — Replace `IN (subquery)` with `EXISTS`
32. **Add database-level CHECK constraints** — Enforce valid ranges

---

## Closing Thoughts

The authentication infrastructure is **solid where it's applied** — `authenticateCoach()` and `authenticateClientAccess()` are well-designed. The problem is they're only used on ~77% of endpoints. The Stripe integration follows reasonable patterns but lacks the defensive programming (idempotency, transactions, circuit breakers) needed for production payment processing. The PWA layer is sophisticated but the cache invalidation and domain migration story needs work.

The frontend is actually in better shape than the backend — no `dangerouslySetInnerHTML` anywhere, proper protected routes, excellent workout autosave with two-layer persistence, sophisticated optimistic update merging in messages, and a solid non-blocking app resume pattern. The main frontend risks are concentrated in form submission handling (missing timeouts, ID collisions) and async subscription cleanup.

The single most impactful thing you can do is add auth checks to those 38 unprotected functions. That alone eliminates the largest attack surface in the application.

Sleep well. This will be here in the morning.
