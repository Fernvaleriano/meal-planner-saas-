import { useState, useEffect } from 'react';

/**
 * Thin bar at the top of the screen that appears briefly when the app
 * resumes from a long background and is re-syncing data.
 *
 * Listens for the 'app-resume-sync' custom events dispatched by
 * useAppLifecycle's triggerResume(). Shows on 'start', hides on 'done'.
 * Also auto-hides after 6 seconds as a safety net.
 */
export default function SyncIndicator() {
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let hideTimer;

    const handler = (e) => {
      if (e.detail?.phase === 'start') {
        setSyncing(true);
        // Safety: auto-hide after 6s in case 'done' never fires
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setSyncing(false), 6000);
      } else if (e.detail?.phase === 'done') {
        // Small delay so the bar is visible long enough to be noticed
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setSyncing(false), 600);
      }
    };

    window.addEventListener('app-resume-sync', handler);
    return () => {
      window.removeEventListener('app-resume-sync', handler);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!syncing) return null;

  return (
    <div className="sync-indicator" aria-live="polite">
      <div className="sync-indicator-bar" />
      <span className="sync-indicator-text">Syncing...</span>
    </div>
  );
}
