/**
 * Shared "who am I" resolver for coach-facing pages (multi-trainer feature).
 *
 * Owners are completely unchanged. A trainer (a login with an active
 * gym_trainers row and NO coaches row) resolves to their GYM as the effective
 * coach, plus their own trainer id for scoping.
 *
 *   ctx = { role: 'owner' | 'trainer' | null,
 *           coachId,      // EFFECTIVE coach id to use for data (gym for a trainer)
 *           trainerId,    // gym_trainers.id for a trainer, else null
 *           user }
 *
 * Client-side reads rely on existing RLS: a coach can read their own coaches
 * row; a trainer can read their own gym_trainers row.
 *
 * Pages that ARE trainer-ready call resolveCoachContext() and use ctx.coachId.
 * Pages that are NOT trainer-ready call guardTrainer() to bounce a trainer to
 * their own dashboard, so they never see the gym-wide owner view.
 */
(function () {
  let cached = null;
  let fetchShimInstalled = false;

  /**
   * Trainer-only fetch shim.
   *
   * A trainer's data endpoints scope results to their assigned clients ONLY
   * when the request carries the trainer's bearer token (the server reads the
   * token to know who the trainer is). Many coach pages call
   * `/.netlify/functions/*` with no Authorization header — for an owner that's
   * fine (no scoping needed), but for a trainer a token-less call would return
   * the gym-wide result and leak the whole roster.
   *
   * So for trainers ONLY we wrap window.fetch and, for same-origin calls to our
   * Netlify functions that don't already set Authorization, attach the current
   * session's access token. Owners never install this (they resolve first and
   * this is gated on role === 'trainer'), so their traffic is byte-for-byte
   * unchanged. The token is fetched fresh per request so it never goes stale.
   */
  function installTrainerFetchShim(supabaseClient) {
    if (fetchShimInstalled) return;
    fetchShimInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    function urlOf(input) {
      try {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url; // Request
        return String(input);
      } catch (e) { return ''; }
    }

    function isFunctionCall(url) {
      // Only our own Netlify functions; ignore Supabase / third-party hosts.
      return typeof url === 'string' && url.indexOf('/.netlify/functions/') !== -1;
    }

    function hasAuth(init, input) {
      try {
        const h = (init && init.headers) || (input && input.headers);
        if (!h) return false;
        if (typeof h.get === 'function') return !!h.get('Authorization');
        return !!(h.Authorization || h.authorization);
      } catch (e) { return false; }
    }

    window.fetch = async function (input, init) {
      const url = urlOf(input);
      if (!isFunctionCall(url) || hasAuth(init, input)) {
        return nativeFetch(input, init);
      }
      let token = null;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        token = session && session.access_token;
      } catch (e) { /* no session → send as-is */ }
      if (!token) return nativeFetch(input, init);

      const nextInit = Object.assign({}, init);
      const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input && input.headers) || {});
      headers.set('Authorization', 'Bearer ' + token);
      nextInit.headers = headers;
      return nativeFetch(input, nextInit);
    };
  }

  async function resolveCoachContext(supabaseClient) {
    if (cached) return cached;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return { role: null, coachId: null, trainerId: null, user: null };
    const user = session.user;

    // Owner wins: a coaches row means you're a coach / gym owner.
    try {
      const { data: coachRow } = await supabaseClient
        .from('coaches').select('id').eq('id', user.id).maybeSingle();
      if (coachRow) {
        cached = { role: 'owner', coachId: user.id, trainerId: null, user };
        return cached;
      }
    } catch (e) { /* fall through */ }

    // Otherwise, an active trainer under a gym.
    try {
      const { data: t } = await supabaseClient
        .from('gym_trainers')
        .select('id, gym_coach_id, status')
        .eq('trainer_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (t) {
        cached = { role: 'trainer', coachId: t.gym_coach_id, trainerId: t.id, user };
        // Trainer traffic must carry the token so server-side scoping engages.
        installTrainerFetchShim(supabaseClient);
        return cached;
      }
    } catch (e) { /* fall through */ }

    // Neither — treat as a plain login acting for itself.
    cached = { role: null, coachId: user.id, trainerId: null, user };
    return cached;
  }

  // Redirect a trainer away from a coach page that isn't trainer-ready yet.
  // Returns the resolved context (so callers can still branch on owner).
  async function guardTrainer(supabaseClient) {
    const ctx = await resolveCoachContext(supabaseClient);
    if (ctx.role === 'trainer') {
      window.location.replace('dashboard.html');
    }
    return ctx;
  }

  window.ZQCoach = { resolveCoachContext, guardTrainer };
})();
