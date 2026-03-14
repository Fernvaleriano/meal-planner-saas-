import { useEffect, useRef, useCallback } from 'react';
import { clearSessionCache, ensureFreshSession, enableSwCacheBypass } from '../utils/api';

/**
 * App Lifecycle Hook
 *
 * Handles the suspend/resume cycle when users switch away from the app
 * (e.g., going to Facebook) and come back. Without this, timers break,
 * auth tokens expire, and the app freezes.
 *
 * Provides:
 * - visibilitychange detection (app backgrounded/foregrounded)
 * - Session refresh on resume (non-blocking — pages can fetch immediately)
 * - Subscriber pattern so components can register their own resume/suspend handlers
 * - Watchdog that catches stuck body styles even if visibilitychange doesn't fire
 * - Network reconnection detection (online/offline events)
 *
 * KEY DESIGN DECISION: Session refresh is NON-BLOCKING on resume.
 * The old "resume gate" pattern blocked ALL API calls until the session refresh
 * completed. On iOS, supabase.auth.refreshSession() can hang for 8-30 seconds
 * because the HTTP connection died during suspension. This caused the exact
 * "data stops loading" symptom users reported. Instead, we:
 * 1. Immediately invalidate the session cache (forces fresh getSession on next call)
 * 2. Fire session refresh in the background (non-blocking)
 * 3. Notify all page subscribers immediately so they can refetch data
 * 4. Pages that get a 401 will auto-retry after the refresh completes (existing logic)
 *
 * The old "keep-alive" system (Web Lock, silent AudioContext, background pings) has
 * been removed. iOS freezes all JS execution when backgrounded regardless of these
 * workarounds, so they only wasted battery without preventing suspension.
 */

// Global subscriber registry — persists across renders and component mounts
const subscribers = new Set();
let lastSuspendTime = null;
let lastSuccessfulResume = Date.now();

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
 * Notify all resume subscribers and perform cleanup.
 *
 * The session refresh runs in the background — it does NOT block subscribers.
 * Pages get notified immediately and can start refetching. If their token is
 * stale, the existing 401-retry logic in authenticatedFetch handles it.
 */
async function triggerResume(backgroundMs) {
  // Show the syncing indicator briefly for long backgrounds
  if (backgroundMs > 5000) {
    window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'start' } }));
  }

  // STEP 1: Immediately invalidate session cache so the next getAuthToken()
  // call fetches a fresh session instead of using a potentially expired cached one.
  // This is fast (synchronous) and ensures no stale tokens are used.
  clearSessionCache();

  // STEP 1b: Enable SW cache bypass for resume refetches.
  // For 10 seconds after resume, all GET requests include X-Cache-Bypass header
  // which tells the service worker to go network-first instead of returning
  // stale cached data from before the app was backgrounded.
  if (backgroundMs > 5000) {
    enableSwCacheBypass(10000);
  }

  // STEP 2: Kick off session refresh in the background (non-blocking).
  // This refreshes the JWT token while pages are already refetching data.
  // If pages get a 401, the authenticatedFetch retry logic handles it.
  if (backgroundMs > 5000) {
    ensureFreshSession().catch((e) => {
      console.error('[AppLifecycle] background session refresh error:', e);
    });
  }

  // STEP 3: Clean up stuck scroll locks — but only if no overlay is active
  if (backgroundMs > 3000) {
    const activeOverlay = document.querySelector(
      '.guided-workout-overlay, .exercise-modal-overlay-v2, .swap-modal-overlay, ' +
      '.workout-summary-overlay, .workout-history-overlay, .club-workouts-overlay, ' +
      '.create-workout-overlay, .add-activity-overlay, .ai-workout-overlay, ' +
      '.readiness-overlay, .rpe-backdrop, .set-editor-overlay, .delete-confirm-overlay'
    );
    if (!activeOverlay) {
      cleanupStuckScrollLock();
    }
  }

  // STEP 4: Notify all resume subscribers IMMEDIATELY — don't wait for session refresh.
  // Each page re-fetches its own data. authenticatedFetch handles token issues.
  for (const entry of subscribers) {
    if (entry.type === 'resume') {
      try {
        entry.handler(backgroundMs);
      } catch (e) {
        console.error('[AppLifecycle] resume handler error:', e);
      }
    }
  }

  lastSuccessfulResume = Date.now();

  // Signal sync complete
  if (backgroundMs > 5000) {
    // Small delay so the indicator is visible briefly (feels like something happened)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'done' } }));
    }, 800);
  }
}

/**
 * Core lifecycle hook — mount this ONCE at the app root level.
 * It listens for visibilitychange and coordinates all resume/suspend work.
 *
 * Also uses a heartbeat timer to detect app resume on iOS devices
 * where visibilitychange doesn't fire (common in PWAs and WebViews).
 * The heartbeat fires every 2s — if >5s elapsed since the last tick,
 * the app was suspended and we trigger all resume handlers.
 */
export function useAppLifecycle() {
  const suspendTimeRef = useRef(null);
  const isResumingRef = useRef(false);

  const handleResume = useCallback(async (backgroundMs) => {
    // Prevent double-fires from heartbeat + visibilitychange both detecting the same resume.
    // Simple guard: if we're already resuming and it's been less than 3 seconds, skip.
    if (isResumingRef.current) return;

    isResumingRef.current = true;
    suspendTimeRef.current = null;

    try {
      await triggerResume(backgroundMs);
    } catch (e) {
      console.error('[AppLifecycle] triggerResume threw:', e);
    } finally {
      // Allow next resume after a brief cooldown to prevent rapid re-fires
      setTimeout(() => {
        isResumingRef.current = false;
      }, 2000);
    }
  }, []);

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
      const backgroundMs = suspendTimeRef.current
        ? Date.now() - suspendTimeRef.current
        : 0;
      await handleResume(backgroundMs);
    }
  }, [handleResume]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle the pageshow event for bfcache restoration (iOS Safari)
    const handlePageShow = (event) => {
      if (event.persisted) {
        handleVisibilityChange();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // ── ONLINE/OFFLINE: Detect network reconnection ──
    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        const sinceLastResume = Date.now() - lastSuccessfulResume;
        if (sinceLastResume > 5000) {
          handleResume(sinceLastResume);
        }
      }
    };

    const handleOffline = () => {
      window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'offline' } }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // ── HEARTBEAT: Detect app resume when visibilitychange doesn't fire ──
    // On iOS PWAs, visibilitychange is unreliable. setInterval callbacks are
    // paused during suspend and fire on resume. If the gap is >5s, we resumed.
    let lastHeartbeat = Date.now();
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const gap = now - lastHeartbeat;
      lastHeartbeat = now;

      if (gap > 5000) {
        handleResume(gap);
      }
    }, 2000);

    // ── WATCHDOG: Detect stuck scroll locks on first touch ──
    let lastWatchdogRun = 0;
    const handleTouchStart = () => {
      const now = Date.now();
      if (now - lastWatchdogRun < 2000) return;
      lastWatchdogRun = now;

      const hasScrollLock =
        document.body.style.overflow === 'hidden' ||
        document.documentElement.style.overflow === 'hidden' ||
        document.body.style.position === 'fixed';

      if (!hasScrollLock) return;

      const activeOverlay = document.querySelector(
        '.exercise-modal-overlay-v2, .swap-modal-overlay, .readiness-overlay, ' +
        '.workout-summary-overlay, .workout-history-overlay, .delete-confirm-overlay, ' +
        '.rpe-backdrop, .add-activity-overlay, .create-workout-overlay, .guided-workout-overlay'
      );

      if (!activeOverlay) {
        cleanupStuckScrollLock();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('click', handleTouchStart, { capture: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(heartbeatInterval);
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('click', handleTouchStart, { capture: true });
    };
  }, [handleVisibilityChange, handleResume]);
}
