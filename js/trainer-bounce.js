/**
 * Drop-in guard for COACH pages that are NOT trainer-ready yet.
 *
 * Include this AFTER the @supabase/supabase-js script on any owner page a gym
 * trainer must not see (anything showing the gym-wide roster or another
 * trainer's clients). If the logged-in user is an active gym trainer (a login
 * with a gym_trainers row and NO coaches row), it sends them to their own
 * dashboard. Owners and clients are untouched.
 *
 * As each coach page is made trainer-aware, remove this include from it.
 * Self-contained on purpose (own lightweight client) so it works no matter how
 * the host page is structured.
 */
(function () {
  var SB_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';
  var tries = 0;

  function run() {
    try {
      if (!window.supabase || !window.supabase.createClient) {
        if (tries++ < 100) return setTimeout(run, 50);
        return;
      }
      // Read-only client: don't auto-refresh or parse the URL, so this guard
      // never competes with the host page's own auth. persistSession stays on
      // (default) so getSession() can read the existing login from storage.
      var sb = window.supabase.createClient(SB_URL, SB_ANON, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false }
      });
      sb.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session) return; // not logged in — the page's own auth handles it
        var uid = session.user.id;
        // Owner? (has a coaches row) -> allowed to stay.
        sb.from('coaches').select('id').eq('id', uid).maybeSingle().then(function (c) {
          if (c && c.data) return;
          // Active trainer? -> bounce to their own dashboard.
          sb.from('gym_trainers').select('id')
            .eq('trainer_user_id', uid).eq('status', 'active').maybeSingle()
            .then(function (t) {
              if (t && t.data) window.location.replace('trainer-dashboard.html');
            });
        });
      });
    } catch (e) { /* never block the page on the guard */ }
  }
  run();
})();
