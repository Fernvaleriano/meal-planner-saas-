import { useEffect, useRef, useCallback } from 'react';
import { ensureFreshSession } from '../utils/api';

/**
 * App Lifecycle Hook
 *
 * Handles the suspend/resume cycle when users switch away from the app
 * (e.g., going to Facebook) and come back. Without this, timers break,
 * auth tokens expire, and the app freezes.
 *
 * Provides:
 * - visibilitychange detection (app backgrounded/foregrounded)
 * - Session refresh on resume
 * - Subscriber pattern so components can register their own resume/suspend handlers
 */

// Global subscriber registry — persists across renders and component mounts
const subscribers = new Set();
let lastSuspendTime = null;

/**
 * Subscribe a handler to app lifecycle events.
 * Returns an unsubscribe function.
 */
export function onAppResume(handler) {
  const entry = { type: 'resume', handler };
  subscribers.add(entry);
  return () => subscribers.delete(entry);
}

export function onAppSuspend(handler) {
  const entry = { type: 'suspend', handler };
  subscribers.add(entry);
  return () => subscribers.delete(entry);
}

/**
 * Get how long the app was in the background (in ms).
 * Returns 0 if unknown or never suspended.
 */
export function getBackgroundDuration() {
  if (!lastSuspendTime) return 0;
  return Date.now() - lastSuspendTime;
}

/**
 * Core lifecycle hook — mount this ONCE at the app root level.
 * It listens for visibilitychange and coordinates all resume/suspend work.
 */
export function useAppLifecycle() {
  const suspendTimeRef = useRef(null);
  const isResumingRef = useRef(false);

  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'hidden') {
      // App going to background
      suspendTimeRef.current = Date.now();
      lastSuspendTime = Date.now();

      // Notify all suspend subscribers
      for (const entry of subscribers) {
        if (entry.type === 'suspend') {
          try {
            entry.handler();
          } catch (e) {
            console.error('[AppLifecycle] suspend handler error:', e);
          }
        }
      }
    } else if (document.visibilityState === 'visible') {
      // App coming back to foreground
      if (isResumingRef.current) return; // prevent double-fires
      isResumingRef.current = true;

      const backgroundMs = suspendTimeRef.current
        ? Date.now() - suspendTimeRef.current
        : 0;
      suspendTimeRef.current = null;

      // If backgrounded for more than 5 seconds, refresh auth session
      // This prevents stale token errors that cause the app to freeze
      if (backgroundMs > 5000) {
        try {
          await ensureFreshSession();
        } catch (e) {
          console.error('[AppLifecycle] session refresh error:', e);
        }
      }

      // Notify all resume subscribers with how long we were away
      for (const entry of subscribers) {
        if (entry.type === 'resume') {
          try {
            entry.handler(backgroundMs);
          } catch (e) {
            console.error('[AppLifecycle] resume handler error:', e);
          }
        }
      }

      isResumingRef.current = false;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle the pageshow event for bfcache restoration (iOS Safari)
    const handlePageShow = (event) => {
      if (event.persisted) {
        // Page was restored from bfcache — treat like a resume
        handleVisibilityChange();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [handleVisibilityChange]);
}
