/**
 * Background Sync Hook
 *
 * Detects when the app becomes active again (via Page Visibility API and
 * the heartbeat in useAppLifecycle) and triggers a silent data refresh
 * instead of a hard UI block.
 *
 * How it works:
 * 1. Subscribe to app resume events from useAppLifecycle
 * 2. When the app resumes after a configurable threshold, call the provided
 *    refresh function silently in the background
 * 3. The UI keeps showing stale data (from state or cache) while the fetch runs
 * 4. Only update state when fresh data arrives — no loading spinners
 *
 * This is the "stale-while-revalidate" pattern at the React component level,
 * complementing the Service Worker SWR at the network level.
 */

import { useEffect, useRef, useCallback } from 'react';
import { onAppResume, getBackgroundDuration } from './useAppLifecycle';

/**
 * @param {Function} refreshFn   Async function that fetches fresh data.
 *                                Should update component state directly.
 * @param {object}   options
 * @param {number}   options.staleAfterMs  Only sync if backgrounded longer than this (default 10s)
 * @param {boolean}  options.enabled        Whether sync is active (default true)
 * @param {number}   options.cooldownMs     Minimum time between syncs (default 5s)
 */
export function useBackgroundSync(refreshFn, options = {}) {
  const {
    staleAfterMs = 10000,
    enabled = true,
    cooldownMs = 5000,
  } = options;

  const refreshRef = useRef(refreshFn);
  const lastSyncRef = useRef(0);
  const isSyncingRef = useRef(false);

  // Keep ref in sync with latest callback
  refreshRef.current = refreshFn;

  const doSync = useCallback(async (backgroundMs) => {
    // Skip if disabled, already syncing, or not stale enough
    if (!enabled) return;
    if (isSyncingRef.current) return;
    if (backgroundMs < staleAfterMs) return;

    // Cooldown: don't sync again if we just synced
    const now = Date.now();
    if (now - lastSyncRef.current < cooldownMs) return;

    isSyncingRef.current = true;
    lastSyncRef.current = now;

    try {
      console.log('[BackgroundSync] Silent sync after', backgroundMs, 'ms in background');
      await refreshRef.current();
    } catch (e) {
      // Silent failure — stale data is better than no data
      console.warn('[BackgroundSync] Sync failed (using stale data):', e.message);
    } finally {
      isSyncingRef.current = false;
    }
  }, [enabled, staleAfterMs, cooldownMs]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = onAppResume((backgroundMs) => {
      // Fire and forget — don't block the resume flow
      doSync(backgroundMs);
    });

    return unsubscribe;
  }, [doSync, enabled]);

  return {
    /** Whether a background sync is currently in progress */
    get isSyncing() { return isSyncingRef.current; },
    /** Manually trigger a sync (e.g., from pull-to-refresh) */
    syncNow: () => doSync(Infinity),
  };
}

export default useBackgroundSync;
