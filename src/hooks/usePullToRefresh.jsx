import { useState, useRef, useCallback, useEffect } from 'react';
import { onAppResume } from './useAppLifecycle';

/**
 * Pull-to-refresh hook — DOM-driven, zero React re-renders during drag.
 *
 * Previous implementation used React state (setPullDistance) on every touch
 * pixel, which re-rendered the entire parent component tree (1900-line
 * Workouts page + all ExerciseCards) on every frame. After iOS
 * suspend/resume this caused the main thread to lock up completely.
 *
 * This version:
 * - Uses native DOM event listeners (not React synthetic events)
 * - Updates the indicator element directly via style manipulation
 * - Only triggers React state changes for isRefreshing (start/end)
 * - The parent component NEVER re-renders during pull gesture
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const { threshold = 60, resistance = 0.5, passiveTouch = false } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerEl, setContainerEl] = useState(null);
  const containerRef = useRef(null);
  const indicatorRef = useRef(null);
  const touchStartRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshTimeoutRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // Keep ref in sync with state so native handlers always see latest value
  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  // Update the indicator element directly — no React re-render
  const updateIndicatorDOM = useCallback((distance) => {
    const el = indicatorRef.current;
    if (!el) return;
    const spinner = el.querySelector('.refresh-spinner');

    if (distance <= 0 && !isRefreshingRef.current) {
      el.style.height = '0px';
      el.style.opacity = '0';
      el.classList.remove('ready', 'refreshing');
      spinner?.classList.remove('spinning', 'ready');
    } else if (isRefreshingRef.current) {
      el.style.height = '50px';
      el.style.opacity = '1';
      el.classList.add('refreshing');
      el.classList.remove('ready');
    } else {
      el.style.height = distance + 'px';
      el.style.opacity = String(Math.min(distance / threshold, 1));
      // Add "ready" class when threshold is reached for visual feedback
      if (distance >= threshold) {
        el.classList.add('ready');
        spinner?.classList.add('ready');
      } else {
        el.classList.remove('ready');
        spinner?.classList.remove('ready');
      }
    }
  }, [threshold]);

  // Attach native touch listeners to the container element
  useEffect(() => {
    const container = containerEl;
    if (!container) return;

    const handleTouchStart = (e) => {
      if (isRefreshingRef.current) return;
      const scrollTop = container.scrollTop || window.scrollY;
      if (scrollTop <= 0) {
        touchStartRef.current = e.touches[0].clientY;
      } else {
        touchStartRef.current = 0;
      }
    };

    const handleTouchMove = (e) => {
      if (!touchStartRef.current || isRefreshingRef.current) return;

      const scrollTop = container.scrollTop || window.scrollY;
      if (scrollTop > 0) {
        touchStartRef.current = 0;
        pullDistanceRef.current = 0;
        updateIndicatorDOM(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartRef.current;

      if (diff > 0) {
        const pulledDistance = Math.min(diff * resistance, threshold * 1.5);
        pullDistanceRef.current = pulledDistance;
        updateIndicatorDOM(pulledDistance);
        // Only preventDefault when not in passive mode.
        // Workouts uses passiveTouch: true (CSS overscroll-behavior handles it)
        // because non-passive touchmove blocks Android compositor scrolling.
        if (!passiveTouch && diff > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      const wasPulled = pullDistanceRef.current >= threshold;

      // Always reset immediately
      touchStartRef.current = 0;
      pullDistanceRef.current = 0;
      updateIndicatorDOM(0);

      if (wasPulled && onRefresh && !isRefreshingRef.current) {
        setIsRefreshing(true);

        // Update indicator to show spinning state
        const el = indicatorRef.current;
        if (el) {
          el.style.height = '50px';
          el.style.opacity = '1';
          const spinner = el.querySelector('.refresh-spinner');
          if (spinner) {
            spinner.classList.add('spinning');
            spinner.textContent = '↻';
          }
        }

        // Safety timeout — force-reset after 10 seconds
        refreshTimeoutRef.current = setTimeout(() => {
          setIsRefreshing(false);
          updateIndicatorDOM(0);
        }, 10000);

        try {
          await onRefresh();
        } catch (error) {
          console.error('Pull-to-refresh error:', error);
        } finally {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
          setIsRefreshing(false);
          updateIndicatorDOM(0);
          // Reset spinner text
          const spinner = indicatorRef.current?.querySelector('.refresh-spinner');
          if (spinner) {
            spinner.classList.remove('spinning');
            spinner.textContent = '↓ Pull to refresh';
          }
        }
      }
    };

    const handleTouchCancel = () => {
      touchStartRef.current = 0;
      pullDistanceRef.current = 0;
      updateIndicatorDOM(0);
    };

    // touchmove is passive only when passiveTouch is opted-in (e.g. Workouts page
    // where CSS overscroll-behavior-y: contain handles native overscroll).
    // Other pages keep non-passive so preventDefault() can block native overscroll.
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: passiveTouch });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [containerEl, onRefresh, threshold, resistance, passiveTouch, updateIndicatorDOM]);

  // Reset everything on app resume (heartbeat-based — works even when
  // visibilitychange doesn't fire on iOS)
  useEffect(() => {
    const resetAll = () => {
      touchStartRef.current = 0;
      pullDistanceRef.current = 0;
      setIsRefreshing(false);
      updateIndicatorDOM(0);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      // Also reset spinner text
      const spinner = indicatorRef.current?.querySelector('.refresh-spinner');
      if (spinner) {
        spinner.classList.remove('spinning');
        spinner.textContent = '↓ Pull to refresh';
      }
    };

    document.addEventListener('visibilitychange', resetAll);
    const unsubResume = onAppResume(resetAll);

    return () => {
      document.removeEventListener('visibilitychange', resetAll);
      unsubResume();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [updateIndicatorDOM]);

  // Bind container ref — call this from a React ref callback
  // Sets both the ref (for sync access) and state (to trigger listener attachment)
  const bindToContainer = useCallback((element) => {
    containerRef.current = element;
    setContainerEl(element);
  }, []);

  // Backward-compatible API for pages that still use the old pattern
  // (pullDistance is always 0 — the visual update is DOM-driven now)
  const containerProps = {
    ref: bindToContainer,
  };

  return {
    isRefreshing,
    pullDistance: 0,
    containerRef,
    indicatorRef,
    bindToContainer,
    containerProps,
    threshold,
  };
}

/**
 * Pull-to-refresh indicator component.
 *
 * Supports two modes:
 * - New (DOM-driven): pass indicatorRef — the hook updates styles directly
 * - Legacy (React-driven): pass pullDistance + isRefreshing — renders via props
 */
export function PullToRefreshIndicator({ indicatorRef, pullDistance, isRefreshing, threshold = 60 }) {
  // New DOM-driven mode: render once, hook updates via ref
  if (indicatorRef) {
    return (
      <div
        ref={indicatorRef}
        className="pull-to-refresh-indicator"
        style={{ height: 0, opacity: 0 }}
      >
        <div className="refresh-spinner">
          <svg className="refresh-icon" viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
          <span className="refresh-text">Pull to refresh</span>
        </div>
      </div>
    );
  }

  // Legacy React-driven mode (used by other pages)
  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div
      className={`pull-to-refresh-indicator ${isRefreshing ? 'refreshing' : ''} ${pullDistance >= threshold ? 'ready' : ''}`}
      style={{
        height: isRefreshing ? 50 : pullDistance,
        opacity: isRefreshing ? 1 : Math.min(pullDistance / threshold, 1)
      }}
    >
      <div className={`refresh-spinner ${isRefreshing ? 'spinning' : ''} ${pullDistance >= threshold ? 'ready' : ''}`}>
        <svg className="refresh-icon" viewBox="0 0 24 24" width="20" height="20">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        <span className="refresh-text">
          {isRefreshing ? 'Refreshing...' : pullDistance >= threshold ? 'Release!' : 'Pull to refresh'}
        </span>
      </div>
    </div>
  );
}

export default usePullToRefresh;
