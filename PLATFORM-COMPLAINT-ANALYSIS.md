# Platform Complaint Analysis: Zique vs. Industry Pain Points

**Date:** March 25, 2026
**Scope:** Comparison of Zique platform against the top 10 complaints from Trainerize, TrueCoach, My PT Hub, Everfit, PT Distinction users (sourced from Trustpilot, G2, Capterra, App Store, Reddit)

---

## Summary Scorecard

| # | Industry Complaint | Industry Pain (1-10) | Zique Risk (1-10) | Verdict |
|---|-------------------|----------------------|---------------------|---------|
| 1 | Buggy, glitchy software | 9 | 4 | Solid foundations, some gaps to fix |
| 2 | Confusing client UX | 8 | 2 | Biggest competitive advantage |
| 3 | Aggressive pricing/billing | 8 | 2 | Clean cancellation, transparent tiers |
| 4 | Limited exercise library | 6 | 3 | 1,500+ exercises + AI generation |
| 5 | Weak progress tracking | 7 | 6 | Biggest gap to address |
| 6 | No wearable integrations | 6 | 3 | Not needed yet, fine to defer |
| 7 | Bad customer support | 8 | 1 | Small team = personal touch |
| 8 | Feature bloat | 7 | 4 | Focused but watch scope creep |
| 9 | Mobile vs web parity | 6 | 2 | Same codebase = same experience |
| 10 | Difficult cancellation | 7 | 1 | Already excellent |

**Overall: Zique avoids the industry's worst sins. The platform will NOT frustrate users the way competitors do — but there are specific gaps to close.**

---

## Detailed Analysis

### 1. Buggy, Glitchy Software — Risk: 4/10

**What the industry gets wrong:** Calorie inputs appearing backwards, app crashes, sync failures, features breaking after updates. Even 5-star G2 reviewers note "with all the features comes bugs."

**Where Zique stands:**
- Service worker implements sophisticated stale-while-revalidate caching with 3-tier architecture (static, data, CDN)
- API layer has smart token refresh with 5-minute buffer, 15-second fetch timeout for slow connections
- App lifecycle management handles resume/suspend detection, stuck scroll-lock cleanup, network reconnection
- 1,248 async/await patterns across 33 HTML files with error handling

**Gaps to fix:**
- HTML pages use `alert()` for errors instead of toast notifications — feels amateurish
- Some `parseInt()` calls lack NaN checks
- No range validation on numeric inputs (calories could be 99,999, age could be 0 or 999)
- Silent `catch` blocks that swallow errors without logging
- No global `window.onerror` or unhandled promise rejection handler
- **38 API functions (23% of surface) rely solely on RLS policies with no application-level auth checks**
- No webhook idempotency on Stripe events (duplicate processing possible)

**Action items:**
1. Replace all `alert()` calls with toast notification UI
2. Add range validation: calories (100-10,000), age (1-120), weight (50-1000 lbs)
3. Add global error handler for unhandled promise rejections
4. Audit and add auth checks to the 38 unprotected endpoints
5. Add Stripe webhook idempotency keys

---

### 2. Poor / Confusing Client UX — Risk: 2/10

**What the industry gets wrong:** Trainers say interfaces are "too much" and "very overwhelming for me and my clients." Older adults and non-tech users can't figure out the apps independently.

**Where Zique stands:**
- Client-facing pages are standalone HTML — not a bloated SPA with nested navigation
- Each page has a single clear purpose (meal planner, client feed, view plan)
- PWA install prompt gives native-app feel without App Store friction
- Mobile-first CSS with safe area support for notched devices
- Touch targets at 48px minimum (mobile-friendly)
- Dark mode support

**This is Zique's biggest competitive advantage.** The simplicity of standalone pages means clients don't need to learn a complex app. The meal planner is focused on one thing. The client feed is a simple activity stream.

**Minor gaps:**
- No onboarding walkthrough or tooltips for first-time users
- Tablet layouts are weak (no 768px-1200px breakpoints)
- No landscape mode optimization

---

### 3. Overpriced / Aggressive Billing — Risk: 2/10

**What the industry gets wrong:** Prices creeping up, features gated behind tiers, difficulty canceling, charges after cancellation.

**Where Zique stands:**
- Simple 3-tier pricing: Starter ($49/10 clients), Growth ($99/50 clients), Professional ($199/300 clients)
- 14-day free trial, no credit card required
- Cancellation flow is excellent:
  - `cancel-subscription.js` (272 lines) handles 4 states properly
  - Paid users keep access until billing cycle end (`cancel_at_period_end`)
  - Trial users get immediate cancellation with clear messaging
  - Sends confirmation email + admin notification
  - Clear modal: "Yes, Cancel" vs "Keep My Subscription"
- No dark patterns, no buried cancellation buttons

**This is miles ahead of Trainerize's buried Settings > Billing > scroll > exit survey process.**

**Gaps to fix:**
- Race condition in reactivation flow could theoretically create duplicate subscriptions
- No failed payment notifications (coach's card expires silently)
- Promo code usage counter never incremented in database

---

### 4. Limited Exercise Library & Customization — Risk: 3/10

**What the industry gets wrong:** Built-in libraries called "an absolute joke," custom exercise creation is tedious, specialized coaches (weightlifting, rehab) can't find their exercises.

**Where Zique stands:**
- 1,500+ exercises in the database
- 3-panel workout builder (`coach-workouts.html`, 13,023 lines)
- AI-powered workout generation via Claude
- Custom exercise creation with video upload support
- PDF export of workout plans
- Workout program import functionality
- Exercise thumbnail management

**This is stronger than most competitors.** The AI generation fills gaps that static libraries can't.

**Gaps to fix:**
- Ensure exercise filtering by equipment/muscle group is fast and intuitive
- Make custom exercise creation a 1-2 click process, not a multi-step form
- Consider allowing coaches to share custom exercise libraries

---

### 5. Weak Progress Tracking — Risk: 6/10 (BIGGEST GAP)

**What the industry gets wrong:** Coaches "didn't feel like I knew enough about my clients' progress." Clients self-report inconsistently.

**Where Zique has:**
- Food diary tracking with macro logging
- Water intake tracking
- Workout log (rep/weight tracking)
- Check-in forms with progress photos
- Client measurements function
- Daily wins system
- Meal photo analysis (AI-powered)

**What's missing:**
- No visual progress graphs or charts (no Chart.js, D3, or equivalent)
- No body measurement trend lines over time
- No adherence percentages (% of meals logged, % of workouts completed)
- No automated weekly progress summaries for coaches
- No progress photo side-by-side comparisons
- No goal-vs-actual visualization
- Stats appear to be text/metric-based only, not visual

**This is the #1 area where Zique could frustrate coaches.** Data-driven coaches need to see trends at a glance, not dig through text metrics.

**Action items (prioritized):**
1. Add weight/measurement line charts over time (Chart.js or similar)
2. Add adherence dashboard (meals logged this week: 5/7, workouts completed: 3/4)
3. Add progress photo comparison view (before/after side-by-side)
4. Add automated weekly summary email to coaches
5. Add macro trend visualization (are they hitting protein targets consistently?)

---

### 6. Poor Wearable / Third-Party Integrations — Risk: 3/10

**What the industry gets wrong:** Promised integrations that don't work — inconsistent Apple Watch pairing, clunky MyFitnessPal syncing, no Google Fit.

**Where Zique stands:**
- Zero wearable integrations (Apple Watch, Google Fit, Oura, Fitbit, MyFitnessPal: none)
- External integrations present: Stripe, Supabase, Claude AI, Edamam, Spoonacular, email services

**This is actually fine.** Half-baked integrations are worse than no integrations. The platforms getting destroyed in reviews *have* wearable integrations — they just work poorly. Better to not promise it than to promise and disappoint.

**When to add (in order):**
1. Apple Health (via Capacitor plugin) — when the native app launches
2. MyFitnessPal import — most requested by coaches
3. Google Fit — Android users
4. Others — only with clear demand

---

### 7. Bad Customer Support — Risk: 1/10

**What the industry gets wrong:** Bots only, month-long response times to reviews, "no real people to talk to."

**Where Zique stands:**
- Small team = every support request gets a human response
- AI trainer support agent (`trainer-support-agent.js`, 672 lines) for self-service
- Voice commander for hands-free support (novel differentiator)
- Email-based contact

**This is a huge advantage at current scale.** The big platforms have 400K+ trainers and can't keep up. Zique can respond same-day.

**To maintain this advantage as you scale:**
- Consider adding in-app chat (Intercom/Crisp) before hitting 500 coaches
- Build a public help center / knowledge base
- Add onboarding email sequence for new coaches

---

### 8. Feature Bloat Without Core Quality — Risk: 4/10

**What the industry gets wrong:** "Platforms invent features and bloat their tool to justify high prices. All this bloat causes uptime issues too."

**Where Zique stands:**
- Core features: meal planning, workout building, client management, messaging, intake forms, billing, client feed
- Extended features: AI nutrition assistant, meal photo analysis, supplement protocols, challenges, daily wins, voice notes, story views

**Assessment: Mostly focused, but watch the edges.** The core is tight and useful. Features like voice notes, stories, and daily wins are nice-to-have but add maintenance burden. 172 Netlify functions is a large surface area for a team this size.

**Guidance:**
- Resist adding features to justify pricing
- Consider if voice notes, stories, and daily wins are earning their maintenance cost
- Focus polish time on the top 5 features coaches use daily
- 1,568 `console.log` statements still in code (dev debris to clean up)

---

### 9. Mobile vs. Web Parity — Risk: 2/10

**What the industry gets wrong:** Key features only available on desktop, clients can't do X from their phone.

**Where Zique stands:**
- Same standalone HTML pages serve both mobile and desktop — identical feature set
- 373 `@media` queries across all files
- PWA manifest configured for standalone app experience
- Service worker provides offline support
- Safe area support for notched devices
- Capacitor config ready for native app wrapping

**This inherently avoids the "can't do X on mobile" complaint** because there's no separate mobile codebase.

**Gaps:**
- Tablet layouts weak (no 768-1200px optimization)
- Capacitor build currently points to legacy HTML pages, not React SPA — needs fixing before App Store launch
- Domain migration will break PWA homescreen saves (native app solves this long-term)

---

### 10. Difficult Cancellation & Account Management — Risk: 1/10

**What the industry gets wrong:** Buried cancellation buttons, charges after canceling, exit surveys blocking the process, no confirmation.

**Where Zique stands:**
- Clear "Manage Subscription" button in billing UI
- Modal confirmation: "Yes, Cancel" vs "Keep My Subscription"
- Separate handling for trial (immediate) vs paid (end of period)
- Confirmation email sent
- Reactivation option available
- No dark patterns, no exit survey gate

**This is already best-in-class.** The only improvements would be adding a brief optional exit survey (for your own insights, not as a gate) and a data export option before account closure.

---

## Top 5 Priority Actions

Based on this analysis, here's what to fix first:

### Priority 1: Progress Tracking Visualization
The biggest gap between Zique and what coaches expect. Add charts, adherence metrics, and progress photo comparisons. This is the feature coaches will evaluate you on.

### Priority 2: Input Validation & Error UX
Replace `alert()` with toast notifications. Add range validation on all numeric inputs. This prevents the "buggy" perception before it starts.

### Priority 3: Auth & Payment Safety
Audit the 38 endpoints with no auth checks. Add Stripe webhook idempotency. Fix the reactivation race condition. These are silent risks that could become loud problems.

### Priority 4: Onboarding Experience
Add a lightweight first-time walkthrough for both coaches and clients. This prevents support tickets and makes the "simple UX" advantage even stronger.

### Priority 5: Automated Coach Insights
Weekly summary emails showing which clients are engaged, which are falling off, macro adherence trends. This solves the "I don't know enough about my clients' progress" complaint proactively.

---

## Bottom Line

**Will your platform frustrate people like the competitors do? No — not in the same ways.**

The industry's top complaints are about bloat, complexity, buggy software, predatory billing, and absent support. Zique avoids all of these structurally:
- Standalone HTML pages = simple, fast, same on every device
- 3-tier transparent pricing with honest cancellation = trust
- Small team = responsive support
- Focused feature set = less bloat, fewer bugs

**The one area where coaches could be disappointed is progress tracking.** Data-driven coaches expect visual dashboards, trend lines, and adherence metrics. Right now Zique collects the data but doesn't present it visually. Fixing this is the single highest-impact improvement you can make.

Everything else is polish — important polish, but not dealbreakers.
