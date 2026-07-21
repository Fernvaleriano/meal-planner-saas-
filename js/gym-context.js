/**
 * Shared "who am I" resolver for coach-facing pages (multi-trainer feature).
 *
 * Owners are completely unchanged. A trainer (a login with an active
 * gym_trainers row and NO coaches row) resolves to their GYM as the effective
 * coach, plus their own trainer id for scoping.
 *
 *   ctx = { role: 'owner' | 'trainer' | null,
 *           coachId,      // EFFECTIVE coach id to use for data (gym for a trainer)
 *           trainerId,    // gym_trainers.id for a trainer, else null
 *           user }
 *
 * Client-side reads rely on existing RLS: a coach can read their own coaches
 * row; a trainer can read their own gym_trainers row.
 *
 * Pages that ARE trainer-ready call resolveCoachContext() and use ctx.coachId.
 * Pages that are NOT trainer-ready call guardTrainer() to bounce a trainer to
 * their own dashboard, so they never see the gym-wide owner view.
 */
(function () {
  let cached = null;

  async function resolveCoachContext(supabaseClient) {
    if (cached) return cached;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return { role: null, coachId: null, trainerId: null, user: null };
    const user = session.user;

    // Owner wins: a coaches row means you're a coach / gym owner.
    try {
      const { data: coachRow } = await supabaseClient
        .from('coaches').select('id').eq('id', user.id).maybeSingle();
      if (coachRow) {
        cached = { role: 'owner', coachId: user.id, trainerId: null, user };
        return cached;
      }
    } catch (e) { /* fall through */ }

    // Otherwise, an active trainer under a gym.
    try {
      const { data: t } = await supabaseClient
        .from('gym_trainers')
        .select('id, gym_coach_id, status')
        .eq('trainer_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (t) {
        cached = { role: 'trainer', coachId: t.gym_coach_id, trainerId: t.id, user };
        return cached;
      }
    } catch (e) { /* fall through */ }

    // Neither — treat as a plain login acting for itself.
    cached = { role: null, coachId: user.id, trainerId: null, user };
    return cached;
  }

  // Redirect a trainer away from a coach page that isn't trainer-ready yet.
  // Returns the resolved context (so callers can still branch on owner).
  async function guardTrainer(supabaseClient) {
    const ctx = await resolveCoachContext(supabaseClient);
    if (ctx.role === 'trainer') {
      window.location.replace('trainer-dashboard.html');
    }
    return ctx;
  }

  window.ZQCoach = { resolveCoachContext, guardTrainer };
})();
