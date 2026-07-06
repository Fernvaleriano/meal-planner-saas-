import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiGet } from '../utils/api';
import { onAppResume } from './useAppLifecycle';

/**
 * Fetches unviewed Pep Talks for the current client.
 *
 * Dismiss model: tapping X soft-dismisses for the current session — the pep
 * talk is hidden from the visible list until the next app resume / page reload.
 * The server-side dismiss_count still increments so we have analytics, but the
 * "viewed" flag stays null. On app resume we clear the local dismissed set
 * and refetch, so the pep talk reappears next session — which is the
 * "keeps popping up until they watch it" requirement.
 *
 * Returns:
 *   pepTalks    – visible pep talks (server list minus locally-dismissed IDs)
 *   refresh     – repull the list (call after view/dismiss)
 *   dismissLocal(id) – hide a pep talk for this session only
 *   removeLocal(id)  – optimistically drop a pep talk from the list right now
 *                      (used by "Got it" so the modal closes instantly; a
 *                      later refresh() re-adds it if the server write failed,
 *                      so the mandatory guarantee still holds)
 */
export function useUnviewedPepTalks(clientId) {
  const [pepTalks, setPepTalks] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const fetchedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    try {
      // apiGet returns the parsed JSON body directly and throws on non-2xx;
      // it does NOT return a fetch Response object.
      const data = await apiGet(`/.netlify/functions/list-pep-talks-for-client?clientId=${clientId}`);
      setPepTalks(Array.isArray(data?.pepTalks) ? data.pepTalks : []);
      fetchedOnceRef.current = true;
    } catch (err) {
      // Network/auth failure — keep showing whatever we had last (per CLAUDE.md
      // case study on slow-failure regressions: don't clear on error).
      console.error('Failed to fetch pep talks:', err);
    }
  }, [clientId]);

  const removeLocal = useCallback((id) => {
    setPepTalks(prev => prev.filter(p => p.id !== id));
  }, []);

  const dismissLocal = useCallback((id) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Initial load when clientId becomes available.
  useEffect(() => {
    if (!clientId) return;
    refresh();
  }, [clientId, refresh]);

  // On app resume: clear the local session-dismissed set so previously-soft-
  // dismissed pep talks come back, then refetch.
  useEffect(() => {
    if (!clientId) return;
    const unsubscribe = onAppResume(() => {
      setDismissedIds(new Set());
      refresh();
    });
    return unsubscribe;
  }, [clientId, refresh]);

  const visiblePepTalks = useMemo(
    () => pepTalks.filter(p => !dismissedIds.has(p.id)),
    [pepTalks, dismissedIds]
  );

  return { pepTalks: visiblePepTalks, refresh, dismissLocal, removeLocal };
}
