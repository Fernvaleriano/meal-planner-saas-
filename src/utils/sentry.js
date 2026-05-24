import * as Sentry from '@sentry/react';

// Error monitoring. No-op when VITE_SENTRY_DSN is unset (dev or branch
// builds without the env var) so missing config never throws.
//
// Intentionally minimal: error capture only, no performance/replay (those
// have separate quotas and we don't need them yet).
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Don't spam Sentry with errors from local dev / preview builds.
    enabled: import.meta.env.PROD,
    // Avoid noisy benign errors: network blips during the SW handoff,
    // ResizeObserver loop warnings (Chrome quirk, no real error), and
    // Safari's "AbortError" from in-flight fetches when the user navigates.
    ignoreErrors: [
      'ResizeObserver loop',
      'AbortError',
      'Non-Error promise rejection captured',
    ],
  });
}

export { Sentry };
