# Domain Change Premortem — `ziquefitnessnutrition.com` → `ziquecoach.com`

**Date:** May 2026
**Method:** Imagine it's November 2026 and the cutover went badly. Work backwards from the disaster to find what we'd wish we'd done.
**Companion doc:** `DOMAIN-CHANGE-CHECKLIST.md` (the existing plan). This document only covers gaps, risks, and sequencing concerns that are NOT already addressed there.

---

## Reality check before reading further

A grep of the current tree shows the code-side migration is **already substantially done**:
- `netlify/functions/utils/email-service.js:17,19` already reads `noreply@ziquecoach.com` / `https://ziquecoach.com`
- `capacitor.config.json` `appId` and `hostname` already point to `ziquecoach`
- Zero remaining references to `ziquefitnessnutrition` or `app.ziquefitness` in `*.html`/`*.js`/`*.json` (excluding the intentional `contact@ziquefitness.com`)
- Service worker cache already bumped to v17

**Implication:** The remaining work is overwhelmingly external (DNS, Supabase, email infra) and operational (sequencing, client UX, DB branding row), not code. The premortem focuses there. Phase 3 of the checklist should be reviewed for "already done" status before treating it as outstanding work.

---

## Failure modes ranked by (probability × blast radius)

### TIER 1 — Most likely to actually bite

#### 1. PWA auth loop on iOS home-screen icons
**Scenario:** A client taps their saved home-screen icon. iOS opens the installed PWA shell, which was registered at `ziquefitnessnutrition.com`. The HTML loads (via 301), but the session cookie scoped to the OLD domain doesn't match the NEW Supabase Site URL. Auth callback fails. They sit in a login loop. Re-saving the home-screen icon — which the heads-up message asks them to do — only works if they actually understand the instructions; iOS PWA replacement is fiddly.

**Why the checklist's mitigation may not be enough:** "Send a screenshot/video of Add to Home Screen steps" assumes clients read and act on it. With ~10 clients and a coach relationship, the safer move is an **individual 5-minute video call** to walk each through it, not a broadcast message.

**Additional mitigation:** Test the PWA-from-icon path explicitly on a clean iOS device BEFORE cutover, both with the redirect in place and from a freshly-saved new-domain icon.

#### 2. Email deliverability tank on new sender
**Scenario:** Cutover Tuesday night. Coach invites a new client Wednesday morning. `noreply@ziquecoach.com` has zero sending reputation. Gmail puts it in spam. Client never sees it. Coach gets no bounce, has no idea. Two weeks of "did you sign up yet?" texts before someone checks spam.

**Gap in checklist:** Phase 2 lists "verify domain in email service" but says nothing about **sender reputation warmup**. A new `noreply@` on a never-sent-from domain is treated as suspicious by major receivers. Realistic mitigations:
- Send low-volume warmup mail (to your own inboxes across Gmail/iCloud/Outlook) for 1-2 weeks BEFORE cutover to build a baseline
- Verify SPF/DKIM/DMARC propagation with mxtoolbox or mail-tester.com — not just "added the records"
- For the first batch of real client invites post-cutover, ask clients to check spam and "Not Spam" the message — actively builds the engagement signal

#### 3. Database branding row never updated
**Scenario:** Cutover finishes Tuesday. Coach forgets Phase 4 (DB update). For a week, clients open the app on the new domain and still see "Zique Fitness Nutrition" everywhere — because `coaches.brand_*` is unchanged. Trust hit and confusion ("did I open the wrong app?").

**Gap in checklist:** Phase 4 is listed AFTER Phase 3 deploy but with no time-binding. It needs to be **part of the cutover sequence itself**, not a follow-up. Better: prepare a SQL UPDATE statement in advance, run it within the same 10-minute window as the DNS flip.

**Secondary risk:** the new logo file in Supabase storage needs RLS policies allowing public read. Pre-cutover, open the logo URL in an incognito browser and confirm it loads — don't assume.

---

### TIER 2 — Lower probability, very high impact if they hit

#### 4. Auto-renew silent failure on `ziquefitness.com`
**Scenario:** Six months from now, the credit card on the registrar account expires. Auto-renew fails. `ziquefitness.com` domain lapses. `contact@ziquefitness.com` email stops resolving. That's:
- The master/admin account email (hardcoded in `master-account-guard.js`, `js/master-account-protector.js`)
- The `ADMIN_EMAIL` fallback in `email-service.js:1256,1306,1356`
- The legal contact in `privacy.html`, `terms.html`

You lose admin access AND key emails simultaneously. Recovery is registrar-grace-period roulette.

**Gap in checklist:** "Set both to auto-renew" is listed but auto-renew is not a guarantee. Additional safeguards:
- Set a calendar reminder 30 days before each renewal date for manual verification
- Add the registrar account to a password manager with renewal alerts
- Consider 2+ year explicit prepay so it's not card-dependent
- Set up a monitor (UptimeRobot / cron + ping) that alerts if `contact@ziquefitness.com` MX records disappear

#### 5. Supabase Site URL change races in-flight auth tokens
**Scenario:** During the cutover window, a client clicks a password reset email that was sent 4 minutes earlier. The link's redirect URL bakes in the OLD domain, but you just updated Supabase Site URL to the new domain. The redirect mismatch causes the token to reject. Client is locked out at the worst moment.

**Gap in checklist:** Phase 2 mentions adding the new domain to the redirect allowlist and "keep old URLs there during transition." That's correct, but the **Site URL flip** (Phase 5 step 6) should be paired with NOT issuing new password resets in the preceding 1 hour. Or, do the Site URL flip BEFORE any clients are likely to be requesting auth flows (Saturday 3am local).

#### 6. No rollback plan
**Scenario:** 45 minutes after cutover, you discover the auth flow is broken end-to-end for iOS Safari. You want to revert. How?
- Revert all code commits → redeploy (5-10 minutes)
- Revert Supabase Site URL → propagation lag
- Revert DNS → 5min to hours depending on TTL
- Revert branding DB row → trivial
- Re-undo any email sent in the meantime → impossible

**Gap in checklist:** No explicit rollback procedure documented. Before cutover, write down the exact rollback steps in order, with the exact SQL/dashboard navigation needed, and the expected total time-to-revert. Keep it open in a tab during the cutover window.

---

### TIER 3 — Long-tail / slow-burn

#### 7. Old URLs baked into historical data
**Scenario:** Welcome emails, intake form invitations, and in-app messages sent before cutover contain absolute links to `ziquefitnessnutrition.com`. The 301 redirect handles them for 12 months. Month 13 arrives, old domain sunsets, and any client who clicks an old link (deep in their email history) gets connection refused — no friendly "this app moved" page.

**Mitigation:** Before sunsetting the old domain in 12 months, replace the 301 with a `/*` rule that serves a static "We've moved — open the app at ziquecoach.com" landing page. This makes the sunset survivable.

**Secondary check:** Audit the `client_intake_forms` / `messages` / `notifications` Supabase tables for stored absolute URLs. If found, a one-time SQL `REPLACE()` migration is far cheaper than support tickets.

#### 8. Stripe webhook eventually configured against the wrong URL
**Scenario:** Months from now, payments get turned on. The Stripe webhook is mistakenly set to the old domain URL. Stripe sends a request, gets a 301, refuses to follow it (Stripe webhooks require 2xx). After repeated failures Stripe auto-disables the endpoint. Payment events drop on the floor silently.

**Mitigation:** When enabling payments, treat the webhook URL as a Tier-1 cutover item: explicitly verify the webhook endpoint URL in the Stripe dashboard points to `ziquecoach.com`, then send a test event from the Stripe CLI and confirm 200 OK.

#### 9. Service worker handoff window
**Scenario:** A client has the app open at the moment of deploy. Their SW v17 is active. The deploy installs v18 (or whatever) but doesn't activate until they close all tabs. They're stuck in a hybrid state: new HTML, old SW. CSP / fetch path mismatches manifest as random 404s in dev tools that they can't decode.

**Mitigation:** The existing pattern of bumping the cache version on every shipped branded change works. Just make sure ONE more version bump happens as part of the cutover deploy, even if no SW logic changed. Forgetting this version bump is the actual failure mode.

#### 10. Apple/Google Sign-In redirect URIs (if/when enabled)
**Scenario:** Google or Apple OAuth gets enabled post-cutover. The redirect URI in the provider console wasn't updated as part of cutover (currently no OAuth in the code, per `grep signInWithOAuth` returning nothing — but if added later, will silently break).

**Mitigation:** Add to the "enabling OAuth" runbook (not the domain checklist): step 1 is "update authorized redirect URIs in provider console to match the current production domain."

---

## Sequencing — the part most likely to be wrong

The checklist lists Phases 1-6 but doesn't strictly order steps within Phase 5. Recommended exact order on cutover day:

```
T-2 weeks  : Email sender warmup begins; SPF/DKIM/DMARC verified externally
T-3 days   : Per-client 1:1 video walkthrough for home-screen re-add
T-2 days   : Logo uploaded to Supabase storage, public-read verified in incognito
T-1 day    : Prepared SQL UPDATE for coaches.brand_* row, tested on a clone
T-1 hour   : Freeze new password resets / signup invites
T+0        : Deploy code (already mostly migrated)
T+5min     : Update Netlify env var URL=https://ziquecoach.com, redeploy
T+10min    : Run the prepared SQL UPDATE on coaches.brand_*
T+15min    : Flip DNS for ziquecoach.com to Netlify
T+20min    : Add ziquecoach.com as primary in Netlify, SSL
T+25min    : Add 301 redirect ziquefitnessnutrition.com/* → ziquecoach.com/:splat
T+30min    : Update Supabase Site URL
T+35min    : Smoke tests (golden paths from checklist Phase 5 step 7)
T+45min    : Decision point — proceed or rollback?
```

The decision-point ("T+45min: proceed or rollback?") is the missing piece. Without it, you slide into a 3-hour debugging session past the point where rollback is cheap.

---

## Additions to fold into `DOMAIN-CHANGE-CHECKLIST.md`

1. **Reality-check Phase 3:** mark items already done in the codebase (most are).
2. **Phase 2 — add email sender warmup task** (2-week lead time).
3. **Phase 4 — move DB branding update into the cutover sequence, not a follow-up.** Prepare the SQL in advance.
4. **Phase 5 — add a written rollback procedure** with the exact order of revert steps and expected total time.
5. **Phase 1 — strengthen auto-renew:** monitor the renewals, don't just "set and forget."
6. **Pre-cutover dress rehearsal:** use a Netlify deploy preview at a `*.netlify.app` URL to test the new branding/logo/auth flows before flipping DNS.
7. **Post-cutover monitoring:** explicit 48-hour Supabase auth log review for failed callbacks tied to old domain.

---

## What we got right

- Keeping `contact@ziquefitness.com` and both domains alive is the conservative call and avoids cascading breakage.
- Clean cutover (not dual-domain) is correct for the 10-client scale — the operational cost of dual-domain auth/cookies/sessions would exceed the benefit.
- Already shipping code with new domain values *behind* the `process.env.URL` indirection means the deploy is decoupled from the DNS flip — that flexibility is valuable and was the right architectural choice.
- Capacitor / native config already migrated means the eventual native app launch isn't a second cutover.

The biggest risks are not in the code. They're in the 48 hours surrounding the DNS flip, in the discipline of running auto-renew monitoring, and in the per-client experience of re-installing the home-screen icon.
