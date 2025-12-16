import { supabase } from './supabase';

// Session cache to avoid repeated getSession calls within short timeframes
let sessionCache = {
  session: null,
  timestamp: 0,
  refreshPromise: null
};

// Session is considered fresh if retrieved within the last 2 minutes (reduced API overhead)
const SESSION_CACHE_TTL = 120000;

// Session is considered stale if it expires within the next 5 minutes
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000;

/**
 * Get auth token with proactive session refresh
 * This ensures the session is valid before making API calls
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
      const expiryTime = expiresAt * 1000; // Convert to milliseconds
      if (expiryTime - now < SESSION_EXPIRY_BUFFER) {
        // Token expiring soon - refresh proactively
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
          // Token expiring soon - refresh proactively
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
        // Clear cache on refresh failure
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
 * Clear the session cache (call on logout or auth state change)
 */
export function clearSessionCache() {
  sessionCache = { session: null, timestamp: 0, refreshPromise: null };
}

/**
 * Force a session refresh (useful after returning from background)
 */
export async function ensureFreshSession() {
  // Clear cache to force a fresh check
  sessionCache.timestamp = 0;
  return await getAuthToken();
}

// Authenticated fetch wrapper with improved error handling
async function authenticatedFetch(url, options = {}) {
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // If we get a 401/403, the token might be invalid - try refreshing once
    if ((response.status === 401 || response.status === 403) && token) {
      console.log('Auth error - attempting session refresh...');
      const newToken = await refreshSession();

      if (newToken && newToken !== token) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, {
          ...options,
          headers
        });

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

    const error = new Error(errorData.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.isAuthError = response.status === 401 || response.status === 403;
    throw error;
  }

  return response.json();
}

// API helper methods
export async function apiGet(url) {
  return authenticatedFetch(url, { method: 'GET' });
}

export async function apiPost(url, data) {
  return authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function apiPut(url, data) {
  return authenticatedFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function apiDelete(url) {
  return authenticatedFetch(url, { method: 'DELETE' });
}
