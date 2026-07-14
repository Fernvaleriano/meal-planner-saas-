# Custom Domains per Coach (White-Label Domains)

A branded coach (tier `professional`/`branded`) can get their own domain —
e.g. `app.huracanfitness.app` — so their members never see ziquecoach.com:
not in the address bar, not in email links, not on the home-screen app.

The platform code is fully domain-aware (migration 030 + host resolution in
`get-coach-branding` / `dynamic-manifest` / `coach-icon`, the app-test.html
head script, Login.jsx, index.html redirect, client email links, gym-login).
**Adding a coach's domain is configuration only — no code changes.**

## Business model (decided July 2026)

- The FOUNDER buys and holds the domain in his own GoDaddy account and
  manages everything; the coach never touches DNS. Cost + margin is baked
  into the coach's plan as a managed add-on.
- Buy a fresh variant (e.g. `huracanfitness.app`) — do NOT take over the
  coach's existing website domain. Get the coach's written OK on the exact
  name before purchasing.
- Prefer $15–30/yr TLDs: `.app`, `.fit`, `.fitness`, `.coach`.
  (`.ai` runs $70–100+/yr with a 2-year minimum.)
- Terms should state the domain is held on the coach's behalf and will be
  transferred to them on request (GoDaddy account-to-account moves are free
  and take minutes).

## Per-coach setup checklist (~15 min + DNS propagation)

Use the member-facing subdomain `app.<domain>` (or the bare domain — both
work; be consistent). Example below: `app.huracanfitness.app`.

1. **Buy the domain** in the founder's GoDaddy account (coach approved the
   exact name).

2. **DNS at GoDaddy:** add a CNAME record
   - Name: `app`
   - Value: `ziquefitnessnutrition.netlify.app`
   (For a bare/apex domain use GoDaddy domain forwarding to the `app.`
   subdomain instead, or an ALIAS/ANAME if available.)

3. **Netlify:** Site `ziquefitnessnutrition` → Domain management →
   Add domain alias → `app.huracanfitness.app`.
   Netlify provisions the HTTPS certificate automatically once DNS
   propagates (minutes to a few hours).

4. **Supabase Auth:** Dashboard → Authentication → URL Configuration →
   Redirect URLs → add `https://app.huracanfitness.app/**`.
   (Without this, password-reset links to the coach domain are refused.)

5. **Database:** point the domain at the coach (lowercase, host only —
   no `https://`, no trailing slash):
   ```sql
   update coaches
   set custom_domain = 'app.huracanfitness.app'
   where id = '<coach uuid>';
   ```

6. **Test the loop on a phone** (fresh browser profile ideally):
   - Open `https://app.huracanfitness.app` → must land on the GYM-branded
     login (never the Ziquecoach homepage).
   - Save to home screen → gym name + icon.
   - Log in as a member → app fully branded.
   - Forgot password → email link points at `app.huracanfitness.app`,
     set-password page branded, lands back on the gym login.
   - `ziquecoach.com/gym/<slug>` → now redirects to the coach domain.

## What resolves by domain (how it works)

- Any request on a non-platform host is treated as a coach domain.
  Platform hosts: ziquecoach.com, www.ziquecoach.com,
  ziquefitnessnutrition.com (+www), *.netlify.app, localhost.
- `get-coach-branding?domain=<host>` → coach lookup by `coaches.custom_domain`.
- `dynamic-manifest` / `coach-icon` also resolve from the request's Host
  header (no cookie needed — this is what keeps Android installs branded).
- `index.html` redirects coach-domain visitors to `/app/login`.
- Client-bound email links (reset, invite/intake, check-in reminders) use
  `https://<custom_domain>` when the coach has one.

## Removing / changing a domain

- `update coaches set custom_domain = null where id = ...` (or set the new
  host), remove the alias in Netlify, remove the Supabase redirect entry.
- Members who saved the home-screen app from the old domain keep a working
  icon only while the old domain still points here — have them re-save
  from the new address.

## Known limits

- Email SENDER address stays `noreply@ziquecoach.com` unless the coach also
  completes the separate white-label email verification (`email_from` /
  `email_from_verified`) — that needs DNS records on a domain they send
  from, and is independent of this feature.
- Coach-facing dashboards stay on ziquecoach.com — coaches are platform
  customers; only the member experience moves to the coach domain.
- If the domain lapses or DNS breaks, that coach's member login breaks —
  auto-renew ON for every held domain, always.
