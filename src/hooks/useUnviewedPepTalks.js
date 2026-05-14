import { useEffect, useState, useCallback, useRef } from 'react';
import { apiGet } from '../utils/api';
import { onAppResume } from './useAppLifecycle';

/**
 * Fetches unviewed Pep Talks for the current client.
 *
 * Why a dedicated hook (not inline in the component): we want to refetch on
 * app resume (iOS users keep the app in the background for hours), and on
 * manual refresh after a viewed/dismissed action. Centralising the lifecycle
 * here keeps the modal component pure.
 *
 * Returns:
 *   pepTalks    – array of { id, title, body, videoUrl, videoDurationSeconds }
 *   refresh     – call after dismiss/view to repull the list
 */
export function useUnviewedPepTalks(clientId) {
  const [pepTalks, setPepTalks] = useState([]);
  const fetchedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    try {
      const response = await apiGet(`/.netlify/functions/list-pep-talks-for-client?clientId=${clientId}`);
      if (!response.ok) {
        // Don't clear state on failure — last good list keeps showing until next success.
        return;
      }
      const data = await response.json();
      setPepTalks(Array.isArray(data.pepTalks) ? data.pepTalks : []);
      fetchedOnceRef.current = true;
    } catch (err) {
      // Network failure — keep showing whatever we had last (per CLAUDE.md
      // case study on slow-failure regressions: don't clear on error).
      console.error('Failed to fetch pep talks:', err);
    }
  }, [clientId]);

  // Initial load when clientId becomes available.
  useEffect(() => {
    if (!clientId) return;
    refresh();
  }, [clientId, refresh]);

  // Refresh on app resume so a pep talk sent while the user was backgrounded
  // pops up when they return.
  useEffect(() => {
    if (!clientId) return;
    const unsubscribe = onAppResume(() => { refresh(); });
    return unsubscribe;
  }, [clientId, refresh]);

  return { pepTalks, refresh };
}
