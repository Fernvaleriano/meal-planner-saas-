# Google sign-in — founder setup steps (≈15 min, one-time)

The code side is done: Google buttons exist on `login.html` (coach login),
`signup.html` (coach signup, free tier), and the client app's `/app/login`.
They DO NOT work until the two steps below are completed — that's why the
branch should only be merged after this setup is done.

## 1. Google Cloud console (console.cloud.google.com)

1. Create a project (or reuse one), name it e.g. "Ziquecoach".
2. **APIs & Services → OAuth consent screen**: External; app name
   "Ziquecoach", support email `contact@ziquefitness.com`; add domain
   `ziquecoach.com`. Publish the app (leave scopes at the defaults —
   email/profile).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: Web application, name "Ziquecoach web".
   - Authorized JavaScript origins: `https://ziquecoach.com`
   - Authorized redirect URI (EXACTLY this):
     `https://qewqcjzlfqamqwbccapr.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

## 2. Supabase dashboard (supabase.com → project "Coach Meal Planner")

1. **Authentication → Providers → Google**: toggle ON, paste the Client ID
   and Client secret, save.
2. **Authentication → URL Configuration**: confirm `https://ziquecoach.com/**`
   is in Redirect URLs (it already is, per the domain-change work).

That's it. Merge the branch after this and the buttons go live.

## How it behaves (for reference)

- **Signup page**: "Start free with Google" requires the two legal
  checkboxes, then creates a FREE coach account (upgrade later as usual).
  If the Google email already belongs to a coach, it just logs them in.
- **Coach login page**: routes by who they are — coach/trainer → dashboard,
  client → the app. A Google email with NO account is signed out with a
  clear message (no account is silently created on a login page).
- **Client app login**: same idea. Bonus: a client who was invited but never
  finished registration gets their invite linked automatically when the
  Google email matches (server-side, verified emails only —
  `netlify/functions/oauth-bootstrap.js`).
- **Same person, two ways in**: Supabase links a Google sign-in to an
  existing email+password account automatically when the email matches and
  is verified — one account, both doors. Worth testing once with a real
  account (sign up with email+password, then sign in with Google using the
  same address).

## Known small gaps (fine for v1)

- The Google button text is English-only in the client app (the rest of the
  login page is translated). Add `login.google` translation keys if wanted.
- White-label gym domains (custom-domain logins) would each need their
  domain added to Supabase Redirect URLs before the button works there —
  the main ziquecoach.com pages are covered.
