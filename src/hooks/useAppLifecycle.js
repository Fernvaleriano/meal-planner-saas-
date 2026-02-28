import { useEffect, useRef, useCallback } from 'react';
import { ensureFreshSession, _setResumeGate } from '../utils/api';

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
 * - Resume gate: blocks ALL API calls until the session is refreshed, preventing
 *   race conditions where pages fetch with stale tokens
 * - Keep-alive: Web Lock + silent ping to resist OS from killing the process
 */

// Global subscriber registry — persists across renders and component mounts
const subscribers = new Set();
let lastSuspendTime = null;

// ── KEEP-ALIVE: Resist OS from killing the app process ──
// Uses multiple strategies because no single one works on all platforms:
// 1. Web Locks API — tells the browser this tab is "in use, don't discard"
// 2. Periodic silent ping — lightweight network activity keeps the process warm
// 3. Silent AudioContext — keeps iOS WebView active (iOS kills silent tabs)

let keepAliveActive = false;
let keepAlivePingInterval = null;
let webLockController = null;
let keepAliveAudioCtx = null;

function startKeepAlive() {
  if (keepAliveActive) return;
  keepAliveActive = true;

  // Strategy 1: Web Locks API — hold a lock for the app lifetime.
  // Signals to the browser that this tab shouldn't be discarded.
  if (navigator.locks) {
    const controller = new AbortController();
    webLockController = controller;
    navigator.locks.request('zique-keep-alive', { signal: controller.signal }, () => {
      // Return a promise that never resolves — holds the lock forever
      return new Promise(() => {});
    }).catch(() => {});
  }

  // Strategy 2: Periodic silent ping every 20s while backgrounded.
  // A tiny HEAD request to our own origin keeps the network stack alive
  // and prevents the OS from marking the WebView as idle.
  keepAlivePingInterval = setInterval(() => {
    if (document.visibilityState === 'hidden') {
      fetch('/manifest.json', { method: 'HEAD', cache: 'no-store' }).catch(() => {});
    }
  }, 20000);

  // Strategy 3: Silent AudioContext — on iOS, having an active audio session
  // prevents the WebView from being suspended. The gain is 0 so no sound plays.
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      keepAliveAudioCtx = new AC();
      const oscillator = keepAliveAudioCtx.createOscillator();
      const gain = keepAliveAudioCtx.createGain();
      gain.gain.value = 0; // completely silent
      oscillator.connect(gain);
      gain.connect(keepAliveAudioCtx.destination);
      oscillator.start();

      // iOS requires user interaction to start audio
      const resumeAudio = () => {
        if (keepAliveAudioCtx && keepAliveAudioCtx.state === 'suspended') {
          keepAliveAudioCtx.resume().catch(() => {});
        }
      };
      document.addEventListener('touchstart', resumeAudio, { once: true, passive: true });
      document.addEventListener('click', resumeAudio, { once: true });
    }
  } catch {
    // AudioContext not available — skip
  }

  console.log('[AppLifecycle] Keep-alive started');
}

function stopKeepAlive() {
  if (!keepAliveActive) return;
  keepAliveActive = false;

  if (keepAlivePingInterval) {
    clearInterval(keepAlivePingInterval);
    keepAlivePingInterval = null;
  }
  if (webLockController) {
    webLockController.abort();
    webLockController = null;
  }
  if (keepAliveAudioCtx) {
    keepAliveAudioCtx.close().catch(() => {});
    keepAliveAudioCtx = null;
  }

  console.log('[AppLifecycle] Keep-alive stopped');
}

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
 * Extracted so both visibilitychange AND the heartbeat can call it.
 */
async function triggerResume(backgroundMs) {
  // If backgrounded for more than 5 seconds, refresh auth session.
  // CRITICAL: We set a "resume gate" that blocks ALL getAuthToken() calls
  // until the session refresh completes. This prevents the race condition
  // where page useEffects fire API calls with the old expired token
  // before ensureFreshSession() has finished.
  if (backgroundMs > 5000) {
    let resolveGate;
    const gate = new Promise((resolve) => { resolveGate = resolve; });
    _setResumeGate(gate);

    try {
      await ensureFreshSession();
    } catch (e) {
      console.error('[AppLifecycle] session refresh error:', e);
    } finally {
      resolveGate();
      _setResumeGate(null);
    }
  }

  // Clean up any stuck scroll locks — but only if no full-screen overlay
  // (like GuidedWorkoutModal) is actively managing the lock.
  // GuidedWorkoutModal re-applies overflow:hidden in its own resume handler,
  // but if we clear it first there's a brief window where touch events can
  // scroll the body on iOS Safari, causing the viewport to freeze.
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
}

/**
 * Core lifecycle hook — mount this ONCE at the app root level.
 * It listens for visibilitychange and coordinates all resume/suspend work.
 *
 * CRITICAL: Also uses a heartbeat timer to detect app resume on iOS devices
 * where visibilitychange doesn't fire (common in PWAs and WebViews).
 * The heartbeat fires every 2s — if >5s elapsed since the last tick,
 * the app was suspended and we trigger all resume handlers.
 */
export function useAppLifecycle() {
  const suspendTimeRef = useRef(null);
  const isResumingRef = useRef(false);

  const handleResume = useCallback(async (backgroundMs) => {
    if (isResumingRef.current) return; // prevent double-fires
    isResumingRef.current = true;

    suspendTimeRef.current = null;
    await triggerResume(backgroundMs);

    isResumingRef.current = false;
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
      // Re-activate the silent audio context on resume (iOS suspends it)
      if (keepAliveAudioCtx && keepAliveAudioCtx.state === 'suspended') {
        keepAliveAudioCtx.resume().catch(() => {});
      }

      const backgroundMs = suspendTimeRef.current
        ? Date.now() - suspendTimeRef.current
        : 0;
      await handleResume(backgroundMs);
    }
  }, [handleResume]);

  useEffect(() => {
    // Start the keep-alive system immediately — this is what keeps the app
    // alive in the background as long as possible
    startKeepAlive();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle the pageshow event for bfcache restoration (iOS Safari)
    const handlePageShow = (event) => {
      if (event.persisted) {
        handleVisibilityChange();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // ── HEARTBEAT: Detect app resume when visibilitychange doesn't fire ──
    // On iOS PWAs / WebViews, visibilitychange is unreliable.
    // setInterval callbacks are paused during suspend and fire on resume.
    // If the gap between ticks is >5s, the app was backgrounded.
    let lastHeartbeat = Date.now();
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const gap = now - lastHeartbeat;
      lastHeartbeat = now;

      // If more than 5 seconds elapsed between 2-second ticks,
      // the app was suspended. Trigger resume cleanup.
      if (gap > 5000) {
        console.log('[AppLifecycle] Heartbeat detected resume after', gap, 'ms');
        handleResume(gap);
      }
    }, 2000);

    // ── WATCHDOG: Detect stuck scroll locks on first touch ──
    // Even after heartbeat fires, the first touch/click is a safety net.
    // Throttled to run at most once per 2 seconds to avoid running an
    // expensive querySelector on every single touch/click event.
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

      // Check if any modal overlay is actually rendered and visible
      const activeOverlay = document.querySelector(
        '.exercise-modal-overlay-v2, .swap-modal-overlay, .readiness-overlay, ' +
        '.workout-summary-overlay, .workout-history-overlay, .delete-confirm-overlay, ' +
        '.rpe-backdrop, .add-activity-overlay, .create-workout-overlay, .guided-workout-overlay'
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
      clearInterval(heartbeatInterval);
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('click', handleTouchStart, { capture: true });
      stopKeepAlive();
    };
  }, [handleVisibilityChange, handleResume]);
}
