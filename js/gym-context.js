// Gym context helper (multi-trainer feature).
//
// Answers one question for coach pages: "is the logged-in user a gym TRAINER,
// and if so which gym do they work for?" A trainer has their own login but no
// `coaches` row — their data scope is the gym owner's coach id (gymCoachId),
// and their client visibility is limited to clients.trainer_id = trainerId.
//
// For every normal coach/gym-owner login this resolves to role:'owner' with
// gymCoachId = their own id, which keeps existing behavior byte-identical.
//
// Usage (after supabase session is known):
//   const ctx = await ZqGymContext.resolve(supabaseClient, session.user.id);
//   if (ctx.role === 'trainer') currentCoachId = ctx.gymCoachId;
(function () {
  const CACHE_KEY = 'zq-gym-context';

  async function resolve(supabaseClient, userId) {
    if (!userId) return ownerContext(userId);

    // Session-cached so page loads stay fast (one lookup per tab session).
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.userId === userId && cached.role) return cached;
    } catch (e) { /* ignore bad cache */ }

    let ctx = ownerContext(userId);
    try {
      const { data: trainerRow, error } = await supabaseClient
        .from('gym_trainers')
        .select('id, gym_coach_id, name, email, status, can_create_clients')
        .eq('trainer_user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      // On error (offline, table missing) fall through as owner — that is the
      // safe default: owners behave exactly as before, and a trainer just gets
      // bounced by the normal "no coach account" path until connectivity is back.
      if (!error && trainerRow) {
        ctx = {
          userId,
          role: 'trainer',
          gymCoachId: trainerRow.gym_coach_id,
          trainerId: trainerRow.id,
          trainerName: trainerRow.name || trainerRow.email || 'Coach',
          canCreateClients: trainerRow.can_create_clients !== false
        };
      }
    } catch (e) { /* treat as owner */ }

    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(ctx)); } catch (e) { /* ignore */ }
    return ctx;
  }

  function ownerContext(userId) {
    return { userId, role: 'owner', gymCoachId: userId, trainerId: null, trainerName: null, canCreateClients: true };
  }

  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
  }

  // Trainers get a slimmed-down sidebar: only the pages that are wired for the
  // trainer role (clients, workout builder, workout plans, messages). Everything
  // else (billing, branding, stats, meal planner, ...) is owner-only for now.
  function applyTrainerChrome(ctx) {
    if (!ctx || ctx.role !== 'trainer') return;
    if (document.getElementById('zq-trainer-chrome')) return;
    const style = document.createElement('style');
    style.id = 'zq-trainer-chrome';
    style.textContent = [
      '.sidebar a[href*="dashboard.html"]',
      '.sidebar a[href*="coach-stats"]',
      '.sidebar a[href*="coach-challenges"]',
      '.sidebar a[href*="coach-profile"]',
      '.sidebar a[href*="coach-billing"]',
      '.sidebar a[href*="billing.html"]',
      '.sidebar a[href*="branding-settings"]',
      '.sidebar a[href*="planner.html"]',
      '.sidebar a[href*="manage-recipes"]',
      '.sidebar a[href*="supplement-protocols"]',
      '.sidebar a[href*="reminder-settings"]',
      '.sidebar a[href*="client-intake"]',
      '.sidebar a[href*="form-responses"]',
      '.sidebar a[href*="client-feed"]',
      '.sidebar a[href*="gym-trainers"]',
      '.sidebar a[href*="gym-dashboard"]'
    ].join(',') + '{display:none !important;}';
    (document.head || document.documentElement).appendChild(style);
  }

  window.ZqGymContext = { resolve, clearCache, applyTrainerChrome, CACHE_KEY };
})();
