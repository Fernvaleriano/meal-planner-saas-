# Codex Deep Code Review — Zique Fitness & Nutrition SaaS

You are performing a comprehensive, production-readiness code review of a fitness & nutrition coaching SaaS platform. This is a **multi-tenant B2B2C app** where coaches manage clients, assign meal plans and workouts, and clients track food, exercise, and progress. The app is preparing for public launch.

---

## Architecture Overview

| Layer | Technology |
|-------|-----------|
| **Frontend** | Hybrid: React 18 SPA (`/src`) + 50+ standalone HTML pages (root `/`) |
| **Build** | Vite 6.0.5, output to `/app-test-dist/` |
| **Backend** | 182 Netlify serverless functions (`/netlify/functions/`) |
| **Database** | Supabase PostgreSQL with RLS, 58 migrations (`/supabase-migrations/`) |
| **Auth** | Supabase JWT (email/password), Bearer tokens |
| **Payments** | Stripe (checkout, webhooks, billing portal) |
| **AI Providers** | Claude (Anthropic), GPT-4o-mini (OpenAI), Gemini 2.5 Flash (Google) |
| **Email** | Resend (primary), SendGrid & Mailgun (fallbacks) |
| **Storage** | Supabase Storage (images, videos, voice notes) |
| **PWA** | Service worker (`/sw.js`), Capacitor for iOS/Android |
| **Hosting** | Netlify |

---

## What To Review (Prioritized)

### 1. AUTHENTICATION & AUTHORIZATION (Critical)

**Shared auth helper:** `netlify/functions/utils/auth.js`

Functions exported:
- `handleCors(event)` — CORS preflight
- `extractToken(event)` — JWT from Authorization header
- `verifyToken(token)` — Supabase JWT verification
- `authenticateRequest(event)` — Simple token check
- `authenticateCoach(event, coachId)` — Coach ownership verification
- `authenticateClientAccess(event, clientId)` — Client OR coach access

**Review tasks:**
- [ ] Verify ALL 182 functions use `authenticateRequest()` or equivalent — flag any that skip auth entirely
- [ ] Check that coach-only endpoints use `authenticateCoach()`, not just `authenticateRequest()`
- [ ] Verify `authenticateClientAccess()` prevents Coach A from accessing Coach B's clients (cross-tenant isolation)
- [ ] Check for IDOR vulnerabilities: can a client pass another client's ID to access their data?
- [ ] Verify Stripe webhook (`stripe-webhook.js`) validates `stripe.webhooks.constructEvent()` signature before processing
- [ ] Check that `validate-intake-token.js` and `validate-signup-code.js` tokens are properly scoped and expire
- [ ] Audit the standalone HTML pages (`/js/api-helper.js`) to confirm they send Bearer tokens correctly and handle 401s
- [ ] Check that `client-self-register.js` and `complete-client-registration.js` cannot be abused to create accounts without valid invites

---

### 2. AI ENDPOINT SECURITY (Critical)

These functions call paid external APIs. A single unprotected endpoint = unbounded cost exposure.

| Function | AI Provider | Rate Limit | Review Focus |
|----------|-------------|------------|--------------|
| `ai-coach-chat.js` | OpenAI GPT-4o-mini | 15/min | Auth + prompt injection |
| `ai-swap-exercise.js` | OpenAI + Claude fallback | 20/min | Auth + input validation |
| `analyze-food-photo.js` | Claude Haiku 4.5 | 20/min | Auth + image size limits |
| `analyze-food-photo-smart.js` | Claude Sonnet 4.5 | 10/min | Auth + cost (expensive model) |
| `analyze-food-text.js` | Claude Haiku 4.5 | 30/min | Auth + input length limits |
| `analyze-nutrition-label.js` | Gemini 2.5 Flash | 20/min | Auth + image validation |
| `coach-ai-assistant.js` | Gemini 2.5 Flash | 10/min | Auth + data leakage between coaches |
| `coach-workout-ai.js` | Gemini 2.5 Flash | 10/min | Auth + coach verification |
| `client-diary-ai.js` | Gemini 2.5 Flash | N/A | Check if rate limited at all |
| `generate-meal-plan-claude.js` | Claude 3.5 Sonnet | 5/min | Auth + cost (most expensive) |
| `generate-workout-claude.js` | Claude | N/A | Check if rate limited at all |
| `meal-brainstorm.js` | Unknown | N/A | Check provider + auth + rate limit |
| `ai-activity-summary.js` | Unknown | 10/min | Check provider + auth |
| `exercise-coach.js` | Unknown | N/A | Check provider + auth + rate limit |
| `transcribe-audio.js` | Unknown | N/A | Check provider + auth + file size |

**Review tasks:**
- [ ] Confirm every AI function has auth AND rate limiting — flag any missing either
- [ ] Check that rate limits are reasonable (e.g., `generate-meal-plan-claude` at 5/min seems right; is 30/min for text analysis too generous?)
- [ ] **CRITICAL:** Rate limiting uses in-memory store that resets on cold starts. Quantify the risk: can an attacker rotate through instances to bypass limits? Recommend Redis/Upstash alternative
- [ ] Check for prompt injection vectors: do any functions pass raw user input directly into system prompts without sanitization?
- [ ] Verify AI functions that accept images validate file type, size, and dimensions before sending to APIs
- [ ] Check that `ai-coach-chat.js` fallback to hardcoded responses doesn't expose internal logic
- [ ] Verify coach-scoped AI functions (coach-ai-assistant, coach-workout-ai) cannot be called by clients
- [ ] Check if AI error responses leak API keys, model names, or internal details

---

### 3. CORS & ORIGIN SECURITY (High)

**Current state:** `CORS_ALLOWED_ORIGIN` defaults to `*` (allow all origins).

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
```

**Review tasks:**
- [ ] Flag every function that overrides the shared `corsHeaders` with its own CORS headers — check for inconsistencies
- [ ] Verify `CORS_ALLOWED_ORIGIN` is set in production Netlify environment (not relying on `*` default)
- [ ] Check if any functions expose methods they don't need (e.g., DELETE on a read-only endpoint)
- [ ] Verify `handleCors()` returns early on OPTIONS with 204 status and correct headers
- [ ] Check that file upload functions restrict origins (these are the most abuse-prone)

---

### 4. STRIPE & PAYMENT SECURITY (High)

**Functions:** `stripe-webhook.js`, `create-checkout-session.js`, `verify-checkout-session.js`, `create-billing-session.js`, `cancel-subscription.js`, `reactivate-subscription.js`

**Review tasks:**
- [ ] Verify webhook signature validation happens BEFORE any database writes
- [ ] Check that `create-checkout-session.js` validates the price ID against allowed values (not user-supplied arbitrary price)
- [ ] Verify `cancel-subscription.js` and `reactivate-subscription.js` check coach ownership (not just auth)
- [ ] Check for race conditions: can two concurrent webhook events for the same subscription cause inconsistent state?
- [ ] Verify trial period logic: can a user get infinite trials by re-registering?
- [ ] Check that `generateTempPassword()` in stripe-webhook uses cryptographically secure randomness
- [ ] Verify subscription status changes cascade correctly (expired → locked out of premium features)
- [ ] Check that Stripe customer portal (`create-billing-session.js`) is scoped to the authenticated coach's customer ID

---

### 5. FILE UPLOAD & STORAGE SECURITY (High)

**Upload functions (15+):** `upload-chat-media.js`, `upload-meal-photo.js`, `upload-profile-photo.js`, `upload-progress-photo.js`, `upload-exercise-video.js`, `upload-recipe-image.js`, `upload-brand-logo.js`, `upload-voice-note.js`, etc.

**Review tasks:**
- [ ] Check EVERY upload function for: file type validation, file size limits, MIME type verification
- [ ] Verify upload paths include proper tenant isolation (coachId/clientId prefixes)
- [ ] Check if any upload functions allow path traversal via manipulated filenames
- [ ] Verify signed URL expiration times are appropriate (currently 24h for some — is that too long?)
- [ ] Check which Supabase Storage buckets are public vs private — flag any that shouldn't be public
- [ ] Verify `get-signed-urls.js` validates that the requesting user owns the files they're requesting URLs for
- [ ] Check for missing auth on any upload endpoint

---

### 6. DATA ISOLATION & MULTI-TENANCY (High)

This is a multi-tenant app. Coach A must NEVER see Coach B's clients, plans, or data.

**Review tasks:**
- [ ] Audit every function that queries the database: does it filter by `coach_id` where appropriate?
- [ ] Check RLS policies in `/supabase-migrations/` — are they comprehensive?
- [ ] Verify `get-clients.js` filters by authenticated coach's ID
- [ ] Check `get-coach-plans.js`, `get-coach-stories.js`, `list-coach-videos.js` for proper scoping
- [ ] Verify shared plan functions (`get-shared-plan.js`, `save-shared-plan.js`) don't leak private data
- [ ] Check if `food-search.js`, `exercises.js` share data across tenants (might be intentional for global DB)
- [ ] Verify `get-dashboard-stats.js` only returns the authenticated coach's stats

---

### 7. INPUT VALIDATION & INJECTION (Medium-High)

**Review tasks:**
- [ ] Check all functions that parse `JSON.parse(event.body)` — do they handle malformed JSON gracefully?
- [ ] Verify Supabase queries use parameterized inputs (not string concatenation)
- [ ] Check AI prompt construction for injection: can a user craft food descriptions or exercise names that manipulate the AI prompt?
- [ ] Verify email addresses are validated before use in queries and email sending
- [ ] Check `import-diet-plan.js`, `import-recipes.js`, `import-workout-program.js` for injection via imported data
- [ ] Verify `food-diary.js` sanitizes food names/descriptions before storage
- [ ] Check `coach-messages` / `chat.js` for XSS in message content

---

### 8. FRONTEND SECURITY (Medium)

**React SPA (`/src/`):**
- [ ] Check `AuthContext.jsx` — does it handle token expiry edge cases (expired token in localStorage on app load)?
- [ ] Verify `api.js` retry logic doesn't create infinite loops on persistent 401s
- [ ] Check that `dangerouslySetInnerHTML` is never used (or is properly sanitized if used)
- [ ] Verify the service worker (`sw.js`) doesn't cache sensitive data (auth tokens, personal info) in ways that persist after logout

**Standalone HTML pages:**
- [ ] Check all 50+ HTML pages use `api-helper.js` consistently (not rolling their own auth)
- [ ] Verify no inline scripts contain sensitive logic that should be server-side
- [ ] Check that `branding.js` sanitizes coach-provided branding values (custom colors, logos, names) before DOM injection — XSS vector
- [ ] Verify password reset flow (`reset-password.html`, `set-password.html`) handles token expiry gracefully

---

### 9. ERROR HANDLING & INFORMATION LEAKAGE (Medium)

**Review tasks:**
- [ ] Check all `catch` blocks — do any return raw error messages to the client that could expose internals?
- [ ] Verify AI function errors don't leak API keys, model names, or prompt content
- [ ] Check Stripe functions don't expose customer IDs or subscription details in error responses
- [ ] Verify `debug-notifications.js` is not accessible in production
- [ ] Check that backfill/sync scripts (`backfill-coach-ids.js`, `sync-all-exercises.js`, etc.) require admin auth or are disabled in production

---

### 10. ENVIRONMENT & CONFIGURATION (Medium)

**23 environment variables used:**
```
SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
CORS_ALLOWED_ORIGIN, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
RESEND_API_KEY, SENDGRID_API_KEY, MAILGUN_API_KEY, MAILGUN_DOMAIN,
EMAIL_FROM, EMAIL_FROM_NAME, URL,
STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PROFESSIONAL,
STRIPE_PRICE_BASIC (legacy), STRIPE_PRICE_BRANDED (legacy), NODE_ENV
```

**Review tasks:**
- [ ] Check which functions have hardcoded fallback values for `SUPABASE_URL` — flag as security risk
- [ ] Verify no API keys are hardcoded anywhere in source (check all 182 functions)
- [ ] Check that `NODE_ENV` checks actually affect behavior (not just logging)
- [ ] Verify legacy Stripe price IDs (`BASIC`, `BRANDED`) are handled gracefully if undefined
- [ ] Check if `URL` environment variable defaults (`ziquefitnessnutrition.com`) could cause redirect issues in staging/dev

---

### 11. DATABASE MIGRATION AUDIT (Medium)

**58 migrations in `/supabase-migrations/`**

**Review tasks:**
- [ ] Check RLS policies are enabled on ALL tables containing user data
- [ ] Verify foreign key constraints exist for coach_id → coaches, client_id → clients
- [ ] Check for missing indexes on frequently queried columns (coach_id, client_id, created_at)
- [ ] Verify cascade delete behavior — what happens when a coach account is deleted?
- [ ] Check if any migrations grant public access to tables that should be restricted
- [ ] Verify the migration sequence is idempotent and can be re-run safely

---

### 12. SERVICE WORKER & PWA (Low-Medium)

**File:** `/sw.js`

**Review tasks:**
- [ ] Verify SW cache is fully cleared on logout (not just specific keys)
- [ ] Check that stale-while-revalidate (5min) doesn't serve dangerously stale data for critical operations (e.g., meal plan changes, payment status)
- [ ] Verify messaging is excluded from SW cache (real-time requirement)
- [ ] Check that cache versioning (currently v13/v7) is properly handled during updates

---

### 13. PERFORMANCE & SCALABILITY CONCERNS

**Review tasks:**
- [ ] Flag any Netlify functions over 500 lines — candidates for splitting
- [ ] Check for N+1 query patterns (fetching lists then querying each item individually)
- [ ] Verify AI functions have timeouts to prevent hanging on slow API responses
- [ ] Check `with-timeout.js` utility — is it used consistently across AI functions?
- [ ] Verify batch operations (`bulk-post-meal-plan.js`, `meal-image-batch.js`) have reasonable limits

---

## Output Format

For each finding, provide:

```
### [SEVERITY: CRITICAL | HIGH | MEDIUM | LOW] — Title

**File:** `path/to/file.js:line_number`
**Category:** (Auth | AI Security | CORS | Payments | Upload | Multi-Tenancy | Input Validation | Frontend | Info Leak | Config | Database | PWA | Performance)

**Issue:** One-sentence description of the problem.

**Evidence:** Show the relevant code snippet.

**Risk:** What could go wrong if this is exploited or left unfixed.

**Fix:** Specific, actionable recommendation with code example if applicable.
```

---

## Summary Requirements

After the full review, provide:

1. **Executive Summary** — 3-5 sentence overview of security posture
2. **Critical Findings** — Must fix before launch (auth bypasses, data leaks, cost exposure)
3. **High Findings** — Should fix before launch (CORS, payment edge cases, upload validation)
4. **Medium Findings** — Fix soon after launch (input validation gaps, error leakage, migration gaps)
5. **Low Findings** — Track for future (performance, PWA edge cases)
6. **Positive Observations** — What's already done well (shared auth helper, rate limiting exists, etc.)
7. **Launch Readiness Score** — 1-10 with justification
8. **Top 5 Actions** — Ordered by impact, with estimated effort (quick fix / half day / multi-day)
