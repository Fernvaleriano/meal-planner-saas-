/**
 * In-house usage tracker (first-party, no cookies, no IP stored).
 * Include with: <script src="/js/usage-tracker.js" data-role="coach" defer></script>
 * Sends a single anonymous-friendly pageview on load. Never throws.
 */
(function () {
  try {
    var script = document.currentScript;
    var role = (script && script.getAttribute('data-role')) || 'visitor';

    // Best-effort token from the Supabase session in localStorage, so this
    // works even on pages that load before (or without) the Supabase client.
    var token = null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') > 0) {
          var raw = JSON.parse(localStorage.getItem(key));
          token = (raw && raw.access_token) || (raw && raw.currentSession && raw.currentSession.access_token) || null;
          if (token) break;
        }
      }
    } catch (e) { /* anonymous is fine */ }

    var payload = JSON.stringify({
      event: 'pageview',
      page: location.pathname,
      role: role
    });

    fetch('/.netlify/functions/track-event', {
      method: 'POST',
      keepalive: true,
      headers: token
        ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        : { 'Content-Type': 'application/json' },
      body: payload
    }).catch(function () { /* tracking must never break a page */ });
  } catch (e) { /* never break the page */ }
})();
