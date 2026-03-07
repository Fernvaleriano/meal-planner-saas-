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
    window.location.reload();
  }, []);

  useEffect(() => {
    let hideTimer;
    let autoDismissTimer;

    const dismiss = () => {
      setSyncing(false);
      setStuck(false);
      setOffline(false);
      clearTimeout(hideTimer);
      clearTimeout(autoDismissTimer);
    };

    const handler = (e) => {
      const phase = e.detail?.phase;

      if (phase === 'start') {
        setSyncing(true);
        setStuck(false);
        setOffline(false);
        clearTimeout(hideTimer);
        clearTimeout(autoDismissTimer);
        // Auto-hide after 30s no matter what — prevents banner from lingering forever
        hideTimer = setTimeout(dismiss, 30000);
      } else if (phase === 'done') {
        clearTimeout(hideTimer);
        clearTimeout(autoDismissTimer);
        setStuck(false);
        setOffline(false);
        hideTimer = setTimeout(() => setSyncing(false), 600);
      } else if (phase === 'stuck') {
        // Only show if actually offline — if online, the app is working fine
        if (!navigator.onLine) {
          clearTimeout(hideTimer);
          clearTimeout(autoDismissTimer);
          setSyncing(true);
          setStuck(true);
        } else {
          // Online but "stuck" — just dismiss, the app is fine
          dismiss();
        }
      } else if (phase === 'offline') {
        setSyncing(true);
        setStuck(false);
        setOffline(true);
        clearTimeout(hideTimer);
        clearTimeout(autoDismissTimer);
      }
    };

    const handleOnline = () => {
      // Device came back online — auto-dismiss after a brief moment
      // (lifecycle hook will handle the actual resync)
      clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(dismiss, 2000);
    };

    window.addEventListener('app-resume-sync', handler);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('app-resume-sync', handler);
      window.removeEventListener('online', handleOnline);
      clearTimeout(hideTimer);
      clearTimeout(autoDismissTimer);
    };
  }, []);

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
