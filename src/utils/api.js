import { supabase } from './supabase';

/**
 * Get the user's timezone using the browser's Intl API
 * Returns IANA timezone string like 'America/Los_Angeles' or 'Asia/Bangkok'
 */
function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// Session cache to avoid repeated getSession calls within short timeframes
let sessionCache = {
  session: null,
  timestamp: 0,
  refreshPromise: null
};

// Session is considered fresh if retrieved within the last 2 minutes
const SESSION_CACHE_TTL = 120000;

// Session is considered stale if it expires within the next 5 minutes
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000;

// Network request timeout — prevents indefinite hangs on poor mobile connections
const FETCH_TIMEOUT_MS = 15000;

// Session refresh timeout — on iOS resume, supabase.auth.refreshSession() can
// hang for 20-30s because the HTTP connection died during suspension. Cap it so
// we fall back to getSession() or 401-retry instead of blocking the data layer.
const SESSION_REFRESH_TIMEOUT = 6000;

// ── SW Cache Bypass ──
// When true, authenticatedFetch adds X-Cache-Bypass header so the service worker
// goes network-first instead of returning stale cached data. Set briefly on resume.
let swCacheBypass = false;
let swCacheBypassTimer = null;

/**
 * Enable SW cache bypass for a brief window (used on app resume).
 * API calls during this window get fresh data from the network instead of
 * stale SW cache entries from before the app was backgrounded.
 */
export function enableSwCacheBypass(durationMs = 10000) {
  swCacheBypass = true;
  clearTimeout(swCacheBypassTimer);
  swCacheBypassTimer = setTimeout(() => { swCacheBypass = false; }, durationMs);
}

/**
 * Fetch with AbortController timeout. Use for direct fetch() calls that bypass
 * authenticatedFetch (e.g., water intake, file uploads). Without this, fetch()
 * calls hang forever on iOS when the network connection dies during backgrounding.
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .then(response => {
      clearTimeout(timeoutId);
      return response;
    })
    .catch(err => {
      clearTimeout(timeoutId);
      throw err;
    });
}

/**
 * Get auth token with proactive session refresh.
 *
 * After app resume, the session cache is cleared (by clearSessionCache),
 * so the first call after resume will always fetch a fresh session via
 * supabase.auth.getSession() — which reads from local storage first (fast).
 *
 * If a refresh is already in progress (from another caller or the lifecycle
 * hook), we DON'T block waiting for it. Instead we try getSession() which
 * returns whatever token Supabase has locally. If that token is expired,
 * the 401-retry path in authenticatedFetch will handle it.
 */
async function getAuthToken() {
  const now = Date.now();

  // Check if cached session is still valid
  if (sessionCache.session && (now - sessionCache.timestamp) < SESSION_CACHE_TTL) {
    // Check if token is expiring soon
    const expiresAt = sessionCache.session.expires_at;
    if (expiresAt) {
      const expiryTime = expiresAt * 1000;
      if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
        // Kick off refresh but don't block — return current token immediately.
        // The 401-retry path handles the case where this token is already expired.
        refreshSession();
        return sessionCache.session.access_token;
      }
    }
    return sessionCache.session.access_token;
  }

  // No cached session (cleared on resume, or first call).
  // supabase.auth.getSession() reads from local storage first — fast even offline.
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
      return null;
    }

    if (session) {
      // Cache it
      sessionCache = {
        ...sessionCache,
        session,
        timestamp: now
      };

      // If expiring soon, kick off background refresh (non-blocking)
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const expiryTime = expiresAt * 1000;
        if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
          refreshSession();
        }
      }

      return session.access_token;
    }

    return null;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Refresh the session token.
 *
 * Coalesces concurrent calls: if a refresh is already in flight, all callers
 * share the same promise (no TOCTOU race — the promise is stored synchronously
 * before any await). Includes a 6-second timeout so iOS resume hangs don't
 * block the data layer.
 */
async function refreshSession() {
  // If a refresh is already in flight, piggyback on it
  if (sessionCache.refreshPromise) {
    try {
      const session = await sessionCache.refreshPromise;
      return session?.access_token || null;
    } catch (e) {
      return null;
    }
  }

  // Create and store the promise SYNCHRONOUSLY before any await.
  // This eliminates the TOCTOU race where two callers both pass
  // the if-check before either stores their promise.
  const refreshPromise = Promise.race([
    (async () => {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Session refresh failed:', error);
        return null;
      }
      return session || null;
    })(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Session refresh timed out')), SESSION_REFRESH_TIMEOUT)
    )
  ]).then(
    (session) => {
      if (session) {
        sessionCache = { session, timestamp: Date.now(), refreshPromise: null };
      } else {
        sessionCache = { ...sessionCache, refreshPromise: null };
      }
      return session;
    },
    (error) => {
      console.error('Session refresh error:', error.message);
      sessionCache = { ...sessionCache, refreshPromise: null };
      return null;
    }
  );

  sessionCache.refreshPromise = refreshPromise;

  const session = await refreshPromise;
  return session?.access_token || null;
}

/**
 * Clear the session cache (call on logout, auth state change, or app resume).
 * After clearing, the next getAuthToken() call will fetch a fresh session
 * from Supabase instead of using a potentially stale cached token.
 */
export function clearSessionCache() {
  sessionCache = { session: null, timestamp: 0, refreshPromise: null };
  lastEnsureFreshTimestamp = 0;
}

// Timestamp of the last successful session refresh via ensureFreshSession.
let lastEnsureFreshTimestamp = 0;

// Debounce window for ensureFreshSession calls
const ENSURE_FRESH_DEBOUNCE = 5000;

/**
 * Force a session refresh (useful after returning from background).
 * Debounced: if called within 5s of a previous call, returns the cached token.
 */
export async function ensureFreshSession() {
  const now = Date.now();

  if ((now - lastEnsureFreshTimestamp) < ENSURE_FRESH_DEBOUNCE) {
    return sessionCache.session?.access_token || await getAuthToken();
  }

  // Clear cache to force a fresh check
  sessionCache.timestamp = 0;
  const token = await getAuthToken();
  lastEnsureFreshTimestamp = Date.now();
  return token;
}

// Authenticated fetch wrapper with improved error handling and timeout
async function authenticatedFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Tell SW to go network-first during resume window (see enableSwCacheBypass)
  if (swCacheBypass && method === 'GET') {
    headers['X-Cache-Bypass'] = '1';
  }

  // Add timeout to prevent indefinite hangs on poor mobile connections
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const error = new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
      error.isTimeout = true;
      throw error;
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // If we get a 401/403, the token might be invalid - try refreshing once
    if ((response.status === 401 || response.status === 403) && token) {
      const newToken = await refreshSession();

      if (newToken && newToken !== token) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
        let retryResponse;
        try {
          retryResponse = await fetch(url, {
            ...options,
            headers,
            signal: retryController.signal
          });
        } catch (retryErr) {
          clearTimeout(retryTimeoutId);
          if (retryErr.name === 'AbortError') {
            const error = new Error(`Retry request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
            error.isTimeout = true;
            error.isAuthError = true;
            throw error;
          }
          throw retryErr;
        }
        clearTimeout(retryTimeoutId);

        if (retryResponse.ok) {
          return retryResponse.json();
        }

        // Still failed after refresh
        const retryError = await retryResponse.json().catch(() => ({}));
        const error = new Error(retryError.error || `HTTP ${retryResponse.status}`);
        error.status = retryResponse.status;
        error.isAuthError = true;
        throw error;
      }
    }

    const msg = errorData.details
      ? `${errorData.error}: ${errorData.details}`
      : (errorData.error || `HTTP ${response.status}`);
    const error = new Error(msg);
    error.status = response.status;
    error.isAuthError = response.status === 401 || response.status === 403;
    throw error;
  }

  const data = await response.json();

  // After successful mutations, force subsequent GETs to bypass stale SW cache
  // for a short window and notify screens to refresh in-place.
  if (method !== 'GET') {
    enableSwCacheBypass(15000);

    // Keep event dispatch best-effort (safe in non-browser contexts/tests)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('app:data-changed', {
          detail: {
            url,
            method,
            timestamp: Date.now()
          }
        }));
      } catch {
        // no-op
      }
    }
  }

  return data;
}

// API helper methods
export async function apiGet(url, options = {}) {
  const timezone = getUserTimezone();
  const separator = url.includes('?') ? '&' : '?';
  const urlWithTimezone = `${url}${separator}timezone=${encodeURIComponent(timezone)}`;
  return authenticatedFetch(urlWithTimezone, { method: 'GET', ...options });
}

export async function apiPost(url, data, options = {}) {
  const timezone = getUserTimezone();
  return authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify({ ...data, timezone }),
    ...options
  });
}

export async function apiPut(url, data) {
  const timezone = getUserTimezone();
  return authenticatedFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ ...data, timezone })
  });
}

export async function apiDelete(url, data) {
  const timezone = getUserTimezone();
  const separator = url.includes('?') ? '&' : '?';
  const urlWithTimezone = `${url}${separator}timezone=${encodeURIComponent(timezone)}`;
  const options = { method: 'DELETE' };
  if (data) {
    options.body = JSON.stringify({ ...data, timezone });
  }
  return authenticatedFetch(urlWithTimezone, options);
}

// ── Workout log creation lock ──
// Without this, concurrent saves from different exercise modals on the same
// date each run their own GET→POST chain, both see "no log exists yet," and
// both INSERT a new workout_log row. There's no DB-level unique constraint
// on (client_id, workout_date), so the dupes stick. Later GETs return only
// one row (`workouts[0]`), so exercise_logs attached to the "other" row
// disappear from the UI — the symptom clients see as "my middle exercise
// reverted to the template default." Serialize here so only one lookup or
// creation request is in flight per (client, date); all concurrent callers
// share the same promise and end up with the same logId.
const inflightLogLookup = new Map();
const LOG_ID_CACHE_KEY_PREFIX = 'workout-log-id-';

export async function getOrCreateWorkoutLogId(clientId, dateStr, workoutName) {
  if (!clientId || !dateStr) return null;

  const storageKey = `${LOG_ID_CACHE_KEY_PREFIX}${clientId}-${dateStr}`;
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) return cached;
  } catch { /* ignore quota / private mode */ }

  const lockKey = `${clientId}|${dateStr}`;
  const existing = inflightLogLookup.get(lockKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const existingRes = await apiGet(
        `/.netlify/functions/workout-logs?clientId=${clientId}&startDate=${dateStr}&endDate=${dateStr}&limit=1`
      );
      const logs = existingRes?.workouts || existingRes?.logs || [];
      if (logs.length > 0 && logs[0]?.id) {
        try { localStorage.setItem(storageKey, logs[0].id); } catch { /* ignore */ }
        return logs[0].id;
      }

      const created = await apiPost('/.netlify/functions/workout-logs', {
        clientId,
        workoutDate: dateStr,
        workoutName: workoutName || 'Workout',
        status: 'in_progress'
      });
      const id = created?.workout?.id || null;
      if (id) {
        try { localStorage.setItem(storageKey, id); } catch { /* ignore */ }
      }
      return id;
    } catch (err) {
      console.error('getOrCreateWorkoutLogId failed:', err);
      return null;
    }
  })();

  inflightLogLookup.set(lockKey, promise);
  // Keep the entry until the promise settles; release after a short grace
  // window so immediately-subsequent callers still share the result without
  // re-hitting the network.
  promise.finally(() => {
    setTimeout(() => inflightLogLookup.delete(lockKey), 2000);
  });
  return promise;
}
