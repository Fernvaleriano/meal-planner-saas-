import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

/**
 * Reports whether the currently signed-in client has an active-enough
 * subscription to access paid features. "Active enough" mirrors the
 * filter on /client-subscription-manage GET:
 *   active, trialing, past_due, canceling, paused
 * If the endpoint returns subscription === null, the client is locked
 * out (canceled, never subscribed, or row otherwise inactive).
 *
 * Coaches bypass entirely — coaches don't have client subscriptions, so
 * `hasActiveSub` is reported as true to keep gates trivially open.
 *
 * Safety: on fetch error we DEFAULT TO ALLOWING ACCESS. A transient API
 * failure should not lock paying clients out of their app.
 */
export function useClientSubscription() {
  const { clientData } = useAuth();
  const coachId = clientData?.coach_id;
  const isCoach = clientData?.is_coach === true;

  const [loading, setLoading] = useState(true);
  const [hasActiveSub, setHasActiveSub] = useState(true);
  const [subscription, setSubscription] = useState(null);

  const refetch = useCallback(async () => {
    if (isCoach || !coachId) {
      setHasActiveSub(true);
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      const res = await apiGet(
        `/.netlify/functions/client-subscription-manage?coachId=${coachId}`
      );
      const sub = res?.subscription || null;
      setSubscription(sub);
      setHasActiveSub(sub !== null);
    } catch (err) {
      console.error('useClientSubscription fetch failed; defaulting to allow access:', err);
      setHasActiveSub(true);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [coachId, isCoach]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { hasActiveSub, subscription, loading, refetch };
}
