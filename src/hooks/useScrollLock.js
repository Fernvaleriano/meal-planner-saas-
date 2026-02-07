import { useEffect } from 'react';

/**
 * Centralized scroll lock with reference counting.
 *
 * Problem: Multiple modals each save/restore document.body.style.overflow
 * independently. When they nest (ExerciseDetail → Swap → Coach Chat),
 * the inner modal captures 'hidden' as the "original" value. If cleanup
 * order is wrong, the body stays locked or gets double-unlocked.
 *
 * Solution: A shared counter. Each modal increments on mount, decrements
 * on unmount. Overflow is only set to '' when the counter reaches zero.
 * No modal ever "saves the original" — the hook manages it globally.
 */

let lockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';

function lock() {
  if (lockCount === 0) {
    // Save original values only on the first lock
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
  }
  lockCount++;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.documentElement.style.overflow = savedHtmlOverflow;
  }
}

/**
 * Force-reset all scroll locks. Used by the watchdog/app-resume
 * when no overlay is visible but overflow is stuck.
 */
export function forceUnlockScroll() {
  lockCount = 0;
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}

/**
 * Hook: call in any modal/overlay that needs to prevent background scroll.
 * Automatically locks on mount, unlocks on unmount.
 */
export function useScrollLock() {
  useEffect(() => {
    lock();
    return () => unlock();
  }, []);
}

export default useScrollLock;
