/*
 * Shared gym-context helper (multi-trainer feature).
 *
 * Coach pages assume "the logged-in user IS the coach" (coach_id = user.id).
 * That's true for a gym OWNER but not for a gym TRAINER, whose login belongs to
 * the gym owner's account and who should only see their assigned clients.
 *
 * This helper resolves that once per page load by asking the backend
 * (/.netlify/functions/gym-context) who the current user is. Pages use it to:
 *   - keep operating on the gym OWNER's coach_id (getEffectiveCoachId), and
 *   - know whether to scope the UI to a trainer (isTrainer / getContext).
 *
 * SAFETY: for an owner this resolves to { role:'owner', gymCoachId: self } and
 * changes nothing. It's only meaningful for trainers. The result is cached for
 * the life of the page so it never adds more than one network call.
 */
(function () {
  let cachedPromise = null;

  async function resolve(accessToken) {
    if (cachedPromise) return cachedPromise;
    cachedPromise = (async () => {
      try {
        const res = await fetch('/.netlify/functions/gym-context', {
          headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        let data = {};
        try { data = await res.json(); } catch (e) { /* ignore */ }
        if (!res.ok) {
          return { role: null, error: data.error || ('HTTP ' + res.status) };
        }
        window.ZiqueGym._ctx = data;
        return data;
      } catch (err) {
        return { role: null, error: (err && err.message) || 'network error' };
      }
    })();
    return cachedPromise;
  }

  window.ZiqueGym = {
    _ctx: null,
    resolve: resolve,
    // The coach_id the page should operate on (the gym owner's id for a trainer).
    getEffectiveCoachId: function () { return window.ZiqueGym._ctx && window.ZiqueGym._ctx.gymCoachId; },
    getContext: function () { return window.ZiqueGym._ctx; },
    isTrainer: function () { return !!(window.ZiqueGym._ctx && window.ZiqueGym._ctx.role === 'trainer'); },
    isOwner: function () { return !!(window.ZiqueGym._ctx && window.ZiqueGym._ctx.role === 'owner'); }
  };
})();
