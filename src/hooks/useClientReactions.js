import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

// Fetches all reactions a coach has left on the logged-in client's items.
// Returns { reactions, getReaction(itemType, itemId), refresh } where
// `reactions` is a map keyed by `${item_type}:${item_id}` ->
// { reaction, created_at }.
export function useClientReactions(itemType) {
  const { clientData } = useAuth();
  const [reactions, setReactions] = useState({});
  const hasFetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const qs = itemType
        ? `?clientId=${clientData.id}&itemType=${encodeURIComponent(itemType)}`
        : `?clientId=${clientData.id}`;
      const data = await apiGet(`/.netlify/functions/get-client-reactions${qs}`);
      setReactions(data?.reactions || {});
    } catch (err) {
      console.error('Error loading client reactions:', err);
    }
  }, [clientData?.id, itemType]);

  useEffect(() => {
    if (clientData?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      refresh();
    }
  }, [clientData?.id, refresh]);

  const getReaction = useCallback((type, id) => {
    if (id == null) return null;
    return reactions[`${type}:${id}`] || null;
  }, [reactions]);

  return { reactions, getReaction, refresh };
}
