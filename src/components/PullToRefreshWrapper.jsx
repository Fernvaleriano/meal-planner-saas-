import { useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

/**
 * Global Pull-to-Refresh Wrapper
 *
 * Provides pull-to-refresh on ALL SPA routes by wrapping the main content area.
 * Pages that already have their own usePullToRefresh hook will work fine because:
 * - Both the wrapper and the per-page hook check scrollTop === 0
 * - The per-page hook is on a more specific (inner) container, so it wins
 * - This wrapper only activates on routes that DON'T have their own implementation
 *
 * How to use:
 *   Wrap your <Outlet /> in Layout.jsx with this component.
 *   It auto-detects route changes and reloads the page data by triggering
 *   a custom 'pull-to-refresh' event that any page can listen to.
 *
 * Pages with existing pull-to-refresh (Dashboard, Diary, Workouts, Plans,
 * Progress, Feed) keep their own implementation. This wrapper catches
 * pages without it: CheckIn, Messages, Notifications, Recipes, Settings,
 * WorkoutHistory.
 */

// Routes that already have their own pull-to-refresh.
// The wrapper will skip firing the generic event for these.
const ROUTES_WITH_OWN_PTR = new Set([
  '/',
  '/diary',
  '/plans',
  '/workouts',
  '/progress',
  '/feed',
]);

function hasOwnPullToRefresh(pathname) {
  // Exact match or starts with (for /plans/:id)
  if (ROUTES_WITH_OWN_PTR.has(pathname)) return true;
  if (pathname.startsWith('/plans/')) return true;
  return false;
}

export default function PullToRefreshWrapper({ children }) {
  const location = useLocation();
  const lastRefreshRef = useRef(0);

  const handleRefresh = useCallback(async () => {
    // Don't fire for routes that handle it themselves
    if (hasOwnPullToRefresh(location.pathname)) return;

    // Debounce — no more than once per second
    const now = Date.now();
    if (now - lastRefreshRef.current < 1000) return;
    lastRefreshRef.current = now;

    // Dispatch a custom event that any page component can listen to.
    // This is a decoupled approach — pages opt-in by adding an event listener.
    window.dispatchEvent(new CustomEvent('pull-to-refresh'));

    // Give the page time to run its refresh logic
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, [location.pathname]);

  const { indicatorRef, bindToContainer } = usePullToRefresh(
    handleRefresh,
    { threshold: 60, resistance: 0.5 }
  );

  // Skip rendering the wrapper's indicator for pages with their own PTR
  const showIndicator = !hasOwnPullToRefresh(location.pathname);

  return (
    <div ref={bindToContainer} style={{ minHeight: '100%' }}>
      {showIndicator && (
        <PullToRefreshIndicator indicatorRef={indicatorRef} />
      )}
      {children}
    </div>
  );
}
