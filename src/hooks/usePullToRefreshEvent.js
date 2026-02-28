import { useEffect, useRef } from 'react';

/**
 * Listen for the global pull-to-refresh event dispatched by PullToRefreshWrapper.
 *
 * Usage:
 *   usePullToRefreshEvent(() => fetchNotifications());
 *
 * This lets pages that don't have their own usePullToRefresh hook
 * respond to the global pull-to-refresh gesture without any setup boilerplate.
 */
export function usePullToRefreshEvent(handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = () => {
      try {
        handlerRef.current();
      } catch (e) {
        console.error('[PullToRefreshEvent] handler error:', e);
      }
    };

    window.addEventListener('pull-to-refresh', listener);
    return () => window.removeEventListener('pull-to-refresh', listener);
  }, []);
}

export default usePullToRefreshEvent;
