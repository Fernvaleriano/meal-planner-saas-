# Coach Limits & Pricing Strategy

> Status: **STRATEGY DECIDED, NOT YET IMPLEMENTED** (May 2026)
> No code or Stripe changes have been made. This document captures the
> current-state limit inventory, competitive analysis, and the agreed
> "premium all-inclusive" pricing direction for later implementation.

---

## Part 1 — Current Coach Limits Inventory (as built today)

### 1. Client count limits (only hard creation cap — tier-based)
Enforced server-side in `netlify/functions/create-client.js:55-113` on every
new client creation (HTTP 403 `CLIENT_LIMIT_REACHED`).

| Tier | Max clients |
|---|---|
| free | 2 |
| starter | 10 |
| growth | 50 |
| professional | 300 |
| basic (legacy → starter) | 10 |
| branded (legacy → professional) | 300 |
| unknown-tier fallback | 10 |

### 2. Subscription tiers & pricing (current, `pricing.html:685-780`)
- Free — $0 — 2 clients, no custom branding
- Starter — $49/mo — 10 clients
- Growth — $99/mo — 50 clients ("Most Popular")
- Professional — $199/mo — 300 clients + custom branding/logo

Stripe price IDs mapped in `create-checkout-session.js:19-26` and
`reactivate-subscription.js:20-26`; webhook tier resolution defaults to
`starter` (`stripe-webhook.js:374`).

### 3. Trial limits
- 14-day free trial, new users only (`create-checkout-session.js:187`);
  existing users get no trial. Hardcoded fallback in
  `stripe-webhook.js:263,280`.
- Coaches can set a `trial_days` on the plans they sell to *their own*
  clients (`coach-billing-plans.js:220,312`) — coach-controlled, not a
  platform cap.

### 4. Video storage quotas (tier-based, `get-video-upload-url.js:16-28`)
Blocks exercise-video uploads with 403 when full.

| Tier | Quota |
|---|---|
| starter / basic | 5 GB |
| growth | 25 GB |
| scale | 50 GB |
| pro-agency / professional / branded | 100 GB |
| unknown fallback | 5 GB |

### 5. File-size upload limits (hardcoded, not tier-based)
- Exercise video: 2 GB/file (`upload-exercise-video.js:13`)
- Chat/message attachment: 250 MB, images/video only (`get-chat-upload-url.js:10`)
- Progress photo: 5 MB (`upload-progress-photo.js:26`)
- Recipe image: 5 MB (`upload-recipe-image.js:22`)
- Food photos: 4 per entry (`FoodModals.jsx:79`)
- Signed upload URL expiry: 7 days

### 6. AI usage / rate limits (per-user, 60s sliding window — `utils/auth.js:201`)
| Function | Limit/min |
|---|---|
| analyze-scale-photo | 20 |
| generate-meal-plan | 10 |
| analyze-nutrition-label | 20 |
| analyze-progress-photos | 5 |
| analyze-food-photo-smart | 10 |
| analyze-food-text | 30 |
| analyze-food-photo | 20 |
| client-diary-ai | 30 |

Plus per-request `max_tokens` ceilings (200–16384), and a client-side
3-attempt cap on AI meal-image generation per gallery session
(`planner.html:13700`).

### 7. Feature gating by tier
- Custom branding = Professional/branded only — enforced in
  `get-coach-branding.js:135`, `dynamic-manifest.js:75`,
  `BrandingContext.jsx:499`, plus upgrade CTAs.

### 8. Subscription-status access gating (block, not a number)
`dashboard.html:8588-8611`: coach must be `active`, `canceling`, or
`trialing` with future `trial_ends_at`, else locked out and redirected to
`subscription-required.html`.

### 9. Minor non-billing caps
- Seed-workout exercise query: 3000
- Storage file-listing count: first 1000 files only
- Workout draft autosave retention: 7 days
- Persisted UI state stale: 30 min
- Thumbnail concurrent loads: 3
- Coach promo codes: optional coach-set `maxUses` (no platform cap)

### Known inconsistencies / bugs to fix on implementation
1. **No limits on workouts, recipes, or meal plans** — unlimited at every
   tier. Client count is the only hard creation cap.
2. **Two divergent tier taxonomies** — billing uses
   `free/starter/growth/professional`; storage uses
   `starter/growth/scale/pro-agency`. **Likely bug:** a Growth coach falls
   through to the 5 GB default for exercise-video storage instead of 25 GB.
   The new pricing (Part 3) unifies these names.
3. Rate limiter is in-memory per-Lambda-instance — effectively soft under
   concurrency.
4. Coach-facing AI endpoints are NOT rate-limited (meal-plan-claude,
   workout-claude, coach-ai-assistant, ai-message-drafter, etc.); only
   client-facing AI is.
5. Unknown-tier client fallback is 10 (Starter-level), not the Free-tier 2.

---

## Part 2 — Competitive Analysis

### TrueCoach (2026)
Client-count-gated tiers, workout-first; nutrition/branding/automation are
higher tiers or add-ons.

| Plan | Price (annual) | Active clients |
|---|---|---|
| Starter | ~$26/mo | up to 5 |
| Standard | ~$58/mo | up to 20 |
| Pro | ~$137/mo | up to 50 |
| Custom | contact sales | 50+ |

### ABC Trainerize (2026)
Granular client tiers plus many paid add-ons (Advanced Nutrition $20–45/mo,
Stripe Payments $10/mo, custom-branded app ~$169).

| Plan | Price | Clients |
|---|---|---|
| Free/Basic | $0 | 1 |
| Grow | from ~$9/mo | 2 |
| Pro | ~$23/mo+ | 5 → up to 200 |
| Studio Plus | ~$248/mo per location | up to 500 members |

### Takeaway
Both competitors gate on **active client count** with a forced upgrade when
exceeded — the same pattern as our `create-client.js` flow. The key
difference: they **fragment features into paid add-ons** (nutrition,
payments, branding). Our product bundles AI meal-plan generation, AI workout
generation, food-photo/nutrition analysis, AI coach assistant, full meal
planning, recipes, and challenges into the base product. We are a more
complete product currently sold cheaper than TrueCoach.

---

## Part 3 — DECIDED: "Premium All-Inclusive" Pricing

**Positioning:** raise per-client price toward TrueCoach's band, keep
*everything* bundled (AI, nutrition, branding, challenges — no add-ons
ever), keep a real free on-ramp so we don't lose new coaches to Trainerize's
$0/$9 entry.

### Final agreed tier table

| Tier | Clients | Price | Notes |
|---|---|---|---|
| Free | 3 | $0 | AI capped — the on-ramp |
| Starter | 15 | $59/mo | Solo coach, full AI included |
| Growth | 50 | $129/mo | Anchored vs TrueCoach $137-for-50 (workout-only) |
| Scale | 100 | $179/mo | Fills the old 50→300 cliff |
| Professional / Agency | 200 | $239/mo | Everything + custom branding |
| 200+ | custom | contact sales | Mirrors TrueCoach "50+ → contact us" |

Price ladder: $0 → $59 → $129 → $179 → $239 (≈$50–60 steps); client counts
double 50 → 100 → 200.

### Strategic rationale
- **Growth @ $129 is the headline comparison:** slightly under TrueCoach's
  $137-for-50, but vastly more product (AI + nutrition + branding included).
  The value story writes itself.
- **Free 2 → 3 clients:** enough to onboard a couple real clients and feel
  the AI; converts better than a 2-client wall.
- **Capped published top tier at 200, whales → "contact sales":** TrueCoach
  does exactly this above 50. Highest-value accounts captured via custom
  conversation, not a fixed price.
- **Tier names unify the codebase:** `starter / growth / scale / pro-agency`
  already exist in the storage-quota code. Adopting them in billing fixes
  the divergent-taxonomy bug (inconsistency #2 above) instead of adding a
  new naming scheme.

### Wedge messaging (for pricing.html / marketing)
> "TrueCoach charges $137/mo for 50 clients and workouts only. We give you
> 50 clients, AI meal plans, AI workouts, nutrition analysis, and your own
> branded app — for $129."

---

## Part 4 — Implementation Checklist (NOT YET DONE)

When ready to implement, in order:

1. **Stripe (external, manual — must be done first):** create the new
   recurring prices ($59 / $129 / $179 / $239) in the Stripe dashboard.
   Capture the new price IDs.
2. **Wire price IDs** into env vars consumed by
   `create-checkout-session.js:19-26` and
   `reactivate-subscription.js:20-26` (add a `scale` key).
3. **Client caps** — update the tier map in `create-client.js:55-113`:
   free 3, starter 15, growth 50, scale 100, professional 200. Change the
   unknown-tier fallback from 10 to the Free value (3) — inconsistency #5.
4. **Storage quotas** — reconcile `get-video-upload-url.js:16-28` and
   `list-coach-videos.js:15-27` so `growth` and `scale` are first-class
   keys (fixes inconsistency #2 — the Growth 5 GB bug).
5. **Webhook tier resolution** — `stripe-webhook.js:372-383`: add `scale`
   price-ID mapping; confirm default tier behavior.
6. **Pricing page copy** — `pricing.html:685-780`: new tiers, prices,
   client counts, wedge messaging, "200+ contact sales" row.
7. **Branding gate** — decide whether custom branding stays
   Professional-only or moves down (currently
   `['professional','branded']` in `get-coach-branding.js:135` et al.).
   Default: leave as the top-tier hook unless changed.
8. **Migrate existing coaches** — map legacy `basic`/`branded` and any
   grandfathered pricing; decide grandfathering policy for current paying
   coaches before changing live prices.

Reminder: changing live prices touches real billing. Steps 1–2 are manual
and external; do not automate Stripe price creation.
