import { useState, useRef, useCallback } from 'react';

/**
 * Reusable pull-to-refresh hook for mobile PWA pages
 *
 * @param {Function} onRefresh - Async function to call when refresh is triggered
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Pull distance in pixels to trigger refresh (default: 80)
 * @param {number} options.resistance - Pull resistance factor 0-1 (default: 0.4)
 * @returns {Object} - Hook state and handlers
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const { threshold = 80, resistance = 0.4 } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    // Only track if we're at the top of the scroll container
    const scrollTop = containerRef.current?.scrollTop || window.scrollY;
    if (scrollTop <= 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchStartRef.current) return;

    // Check if we're still at the top
    const scrollTop = containerRef.current?.scrollTop || window.scrollY;
    if (scrollTop > 0) {
      touchStartRef.current = 0;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartRef.current;

    if (diff > 0) {
      // Apply resistance to pull
      const pulledDistance = Math.min(diff * resistance, threshold * 1.5);
      setPullDistance(pulledDistance);
    }
  }, [resistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && onRefresh && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull-to-refresh error:', error);
      } finally {
        setIsRefreshing(false);
      }
    }
    touchStartRef.current = 0;
    setPullDistance(0);
  }, [pullDistance, threshold, onRefresh, isRefreshing]);

  // Bind handlers to a container element
  const bindToContainer = useCallback((element) => {
    containerRef.current = element;
  }, []);

  // Props to spread on the container element
  const containerProps = {
    ref: bindToContainer,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  return {
    isRefreshing,
    pullDistance,
    containerProps,
    containerRef,
    threshold,
  };
}

/**
 * Pull-to-refresh indicator component
 * Use with the usePullToRefresh hook
 */
export function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 80 }) {
  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div
      className="pull-to-refresh-indicator"
      style={{
        height: isRefreshing ? 50 : pullDistance,
        opacity: isRefreshing ? 1 : Math.min(pullDistance / threshold, 1)
      }}
    >
      <div className={`refresh-spinner ${isRefreshing ? 'spinning' : ''}`}>
        {isRefreshing ? '↻' : pullDistance >= threshold ? '↓ Release to refresh' : '↓ Pull to refresh'}
      </div>
    </div>
  );
}

export default usePullToRefresh;
