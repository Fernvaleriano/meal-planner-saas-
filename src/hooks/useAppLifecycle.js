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
 * - Watchdog that catches stuck body styles even if visibilitychange doesn't fire
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
 * Clean up stuck body/html scroll locks.
 * Called from multiple places as a safety net.
 */
function cleanupStuckScrollLock() {
  let cleaned = false;

  if (document.body.style.overflow === 'hidden') {
    document.body.style.overflow = '';
    cleaned = true;
  }
  if (document.documentElement.style.overflow === 'hidden') {
    document.documentElement.style.overflow = '';
    cleaned = true;
  }
  // Legacy: position:fixed body hack
  if (document.body.style.position === 'fixed') {
    const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
    cleaned = true;
  }

  return cleaned;
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
      if (backgroundMs > 5000) {
        try {
          await ensureFreshSession();
        } catch (e) {
          console.error('[AppLifecycle] session refresh error:', e);
        }
      }

      // Clean up any stuck scroll locks
      if (backgroundMs > 3000) {
        cleanupStuckScrollLock();
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
        handleVisibilityChange();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // Watchdog: detect stuck scroll locks that visibilitychange missed.
    // On iOS, visibilitychange sometimes doesn't fire. This catches the case
    // where the user comes back to a frozen screen — the first touch/click
    // will trigger cleanup and the UI becomes responsive again.
    const handleTouchStart = () => {
      // Only act if body/html has a stuck scroll lock AND no modal overlay is
      // currently visible in the DOM. If a modal IS visible, the lock is intentional.
      const hasScrollLock =
        document.body.style.overflow === 'hidden' ||
        document.documentElement.style.overflow === 'hidden' ||
        document.body.style.position === 'fixed';

      if (!hasScrollLock) return;

      // Check if any modal overlay is actually rendered and visible
      const activeOverlay = document.querySelector(
        '.exercise-modal-overlay-v2, .swap-modal-overlay, .readiness-overlay, ' +
        '.workout-summary-overlay, .workout-history-overlay, .delete-confirm-overlay, ' +
        '.rpe-backdrop, .add-activity-overlay, .create-workout-overlay'
      );

      if (!activeOverlay) {
        // Scroll lock is stuck with no visible modal — clean it up
        cleanupStuckScrollLock();
      }
    };

    // Use capture phase so we see the event even if something else calls stopPropagation
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('click', handleTouchStart, { capture: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('click', handleTouchStart, { capture: true });
    };
  }, [handleVisibilityChange]);
}
