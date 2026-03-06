import { useState, useEffect, useCallback } from 'react';

/**
 * Thin bar at the top of the screen that appears briefly when the app
 * resumes from a long background and is re-syncing data.
 *
 * Listens for the 'app-resume-sync' custom events dispatched by
 * useAppLifecycle's triggerResume(). Shows on 'start', hides on 'done'.
 *
 * NEW: When the resume flow takes too long (phase: 'stuck') or the device
 * goes offline (phase: 'offline'), shows a "Reload" button so users can
 * instantly recover instead of repeatedly pulling down to refresh or
 * force-quitting the app.
 */
export default function SyncIndicator() {
  const [syncing, setSyncing] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [offline, setOffline] = useState(false);

  const handleReload = useCallback(() => {
    // Reload the current page. This is equivalent to the user closing and
    // reopening the app but faster — it preserves the current URL so the
    // user lands back on the same page.
    window.location.reload();
  }, []);

  useEffect(() => {
    let hideTimer;

    const handler = (e) => {
      const phase = e.detail?.phase;

      if (phase === 'start') {
        setSyncing(true);
        setStuck(false);
        setOffline(false);
        // Safety: auto-hide after 20s in case 'done' never fires.
        // Session refresh can take up to 15s on slow mobile connections,
        // but after 20s something is clearly wrong — the stuck phase
        // should have fired by then.
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          setStuck(true);
        }, 20000);
      } else if (phase === 'done') {
        // Small delay so the bar is visible long enough to be noticed
        clearTimeout(hideTimer);
        setStuck(false);
        setOffline(false);
        hideTimer = setTimeout(() => setSyncing(false), 600);
      } else if (phase === 'stuck') {
        // Resume is taking too long — show the reload button
        clearTimeout(hideTimer);
        setStuck(true);
      } else if (phase === 'offline') {
        // Device went offline
        setSyncing(true);
        setStuck(false);
        setOffline(true);
        clearTimeout(hideTimer);
      }
    };

    // Also listen for the device coming back online to clear offline state
    const handleOnline = () => {
      if (offline) {
        setOffline(false);
        // The lifecycle hook will trigger a resume sync, so just clear offline
      }
    };

    window.addEventListener('app-resume-sync', handler);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('app-resume-sync', handler);
      window.removeEventListener('online', handleOnline);
      clearTimeout(hideTimer);
    };
  }, [offline]);

  if (!syncing) return null;

  return (
    <div className={`sync-indicator ${stuck || offline ? 'sync-indicator--actionable' : ''}`} aria-live="polite">
      {!stuck && !offline && <div className="sync-indicator-bar" />}
      <div className={`sync-indicator-content ${stuck || offline ? 'sync-indicator-content--expanded' : ''}`}>
        <span className="sync-indicator-text">
          {offline ? 'No connection' : stuck ? 'Having trouble reconnecting' : 'Reconnecting...'}
        </span>
        {(stuck || offline) && (
          <button
            className="sync-indicator-reload"
            onClick={handleReload}
            aria-label="Reload page"
          >
            Reload
          </button>
        )}
      </div>
    </div>
  );
}
