// Sentry error monitoring for the legacy coach HTML pages.
// Mirrors src/utils/sentry.js (which covers the React client app under /app).
//
// Why hardcoded DSN: these pages have no build step (no Vite, no env
// injection). The DSN is public-safe by design -- Sentry DSNs identify a
// project but don't grant any read/write access to the dashboard. Anyone
// inspecting a Sentry-using site can already see its DSN in network
// traffic, so hardcoding adds no exposure.
//
// Production-only: skips localhost/preview so dev errors don't burn the
// free-tier quota or pollute the dashboard.

(function () {
  if (typeof window === 'undefined') return;

  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return;
  }

  var s = document.createElement('script');
  s.src = 'https://browser.sentry-cdn.com/10.53.0/bundle.min.js';
  s.crossOrigin = 'anonymous';
  s.async = true;
  s.onload = function () {
    if (!window.Sentry || typeof window.Sentry.init !== 'function') return;
    window.Sentry.init({
      dsn: 'https://95c132b732c701be6b39b3af628f6c35@o4511442846941184.ingest.us.sentry.io/4511442855067648',
      environment: 'production',
      ignoreErrors: [
        'ResizeObserver loop',
        'AbortError',
        'Non-Error promise rejection captured',
      ],
    });
  };
  document.head.appendChild(s);
})();
