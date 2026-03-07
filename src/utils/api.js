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

/**
 * Get auth token with proactive session refresh.
 * This ensures the session is valid before making API calls.
 *
 * After app resume, the session cache is cleared (by clearSessionCache),
 * so the first call after resume will always fetch a fresh session.
 * No blocking gate is needed — if the token is expired, the 401-retry
 * logic in authenticatedFetch handles it transparently.
 */
async function getAuthToken() {
  const now = Date.now();

  // If we have a refresh in progress, wait for it
  if (sessionCache.refreshPromise) {
    try {
      await sessionCache.refreshPromise;
    } catch (e) {
      // Ignore - we'll try to get a fresh session below
    }
  }

  // Check if cached session is still valid
  if (sessionCache.session && (now - sessionCache.timestamp) < SESSION_CACHE_TTL) {
    // Check if token is expiring soon
    const expiresAt = sessionCache.session.expires_at;
    if (expiresAt) {
      const expiryTime = expiresAt * 1000;
      if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
        return await refreshSession();
      }
    }
    return sessionCache.session.access_token;
  }

  // Get current session
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
      return null;
    }

    if (session) {
      // Check if token is expiring soon
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const expiryTime = expiresAt * 1000;
        if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
          return await refreshSession();
        }
      }

      // Cache the session
      sessionCache = {
        session,
        timestamp: now,
        refreshPromise: null
      };
      return session.access_token;
    }

    return null;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Proactively refresh the session before it expires
 */
async function refreshSession() {
  // Prevent concurrent refresh calls
  if (sessionCache.refreshPromise) {
    try {
      const session = await sessionCache.refreshPromise;
      return session?.access_token || null;
    } catch (e) {
      // Fall through to try again
    }
  }

  const refreshPromise = (async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error('Session refresh failed:', error);
        sessionCache = { session: null, timestamp: 0, refreshPromise: null };
        return null;
      }

      if (session) {
        sessionCache = {
          session,
          timestamp: Date.now(),
          refreshPromise: null
        };
        return session;
      }

      return null;
    } catch (error) {
      console.error('Session refresh error:', error);
      sessionCache = { session: null, timestamp: 0, refreshPromise: null };
      return null;
    }
  })();

  sessionCache.refreshPromise = refreshPromise;

  try {
    const session = await refreshPromise;
    return session?.access_token || null;
  } finally {
    sessionCache.refreshPromise = null;
  }
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
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
      console.log('Auth error - attempting session refresh...');
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

  return response.json();
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
