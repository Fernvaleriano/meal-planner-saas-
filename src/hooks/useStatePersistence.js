/**
 * State Persistence Hook
 *
 * Keeps critical app state "warm" in sessionStorage so that when the OS
 * suspends the WebView (e.g., user switches to another app and comes back),
 * the page can rehydrate instantly from the snapshot instead of showing a
 * loading spinner while re-fetching everything.
 *
 * How it works:
 * 1. On suspend (visibilitychange → hidden), snapshot current state to sessionStorage
 * 2. On resume (visibilitychange → visible), return the snapshot so the page can
 *    render immediately while a background fetch refreshes the data
 * 3. Uses requestIdleCallback (or setTimeout fallback) so writes never block the main thread
 * 4. Debounces writes to avoid excessive storage churn during rapid state changes
 *
 * sessionStorage is used (not localStorage) because:
 * - It's scoped to the tab/session — no cross-tab conflicts
 * - It's automatically cleaned up when the tab closes
 * - It survives in-tab navigation and soft suspends (exactly our use case)
 */

import { useCallback, useEffect, useRef } from 'react';
import { onAppSuspend } from './useAppLifecycle';

const STORAGE_PREFIX = 'zq_state_';
const DEBOUNCE_MS = 1000;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — stale after this

// requestIdleCallback with fallback for Safari / older WebViews
const scheduleIdle = typeof window !== 'undefined' && window.requestIdleCallback
  ? window.requestIdleCallback
  : (cb) => setTimeout(cb, 1);

/**
 * Save state snapshot to sessionStorage (non-blocking).
 */
function persistState(key, data) {
  scheduleIdle(() => {
    try {
      const payload = JSON.stringify({
        data,
        timestamp: Date.now(),
      });
      sessionStorage.setItem(STORAGE_PREFIX + key, payload);
    } catch (e) {
      // Storage full or private mode — silently ignore
      console.warn('[StatePersistence] Write failed:', e.message);
    }
  });
}

/**
 * Read a persisted snapshot. Returns null if missing or stale.
 */
export function getPersistedState(key, maxAge = MAX_AGE_MS) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;

    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > maxAge) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Remove a persisted snapshot (e.g., on logout).
 */
export function clearPersistedState(key) {
  try {
    if (key) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    } else {
      // Clear all persisted state
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch {
    // Ignore
  }
}

/**
 * Hook: persist a state snapshot and restore it on resume.
 *
 * @param {string} key     Unique key for this page/component state
 * @param {object} state   The current state object to persist
 * @returns {{ snapshot: object|null }}  The last persisted snapshot (or null)
 */
export function useStatePersistence(key, state) {
  const debounceRef = useRef(null);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  // Persist on suspend (app going to background)
  useEffect(() => {
    const unsubscribe = onAppSuspend(() => {
      // Flush immediately on suspend — no debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      persistState(key, latestStateRef.current);
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [key]);

  // Debounced auto-persist on state changes
  const persist = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      persistState(key, latestStateRef.current);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  }, [key]);

  // Auto-persist when state changes (debounced)
  useEffect(() => {
    persist();
  }, [state, persist]);

  return {
    snapshot: getPersistedState(key),
  };
}

export default useStatePersistence;
