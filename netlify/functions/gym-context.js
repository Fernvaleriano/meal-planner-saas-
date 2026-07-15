// Netlify Function: resolve the logged-in user's "gym context".
//
// This is the front-end bootstrap for the multi-trainer feature. A coach page
// calls it with the user's bearer token and gets back everything it needs to
// decide how to behave:
//
//   role: 'owner'   → a normal coach / gym owner. gymCoachId = their own id,
//                     trainerId = null. Nothing about them changes.
//   role: 'trainer' → an active trainer under a gym. gymCoachId = the GYM
//                     OWNER's id (what coach_id points at on every client),
//                     trainerId scopes them to their assigned clients, and the
//                     gym's brand + the OWNER's subscription status ride along
//                     (a trainer inherits the gym's subscription).
//
// SAFETY: this is read-only. It never writes anything. Owners resolve on the
// exact same coaches-row lookup they already do, so their path is unchanged.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, resolveGymContext, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

function json(statusCode, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// Mirror of the subscription gate used across the coach pages: active,
// canceling (still paid through period end), or a trial that hasn't lapsed.
function subscriptionOk(coach) {
  if (!coach) return false;
  const status = coach.subscription_status;
  if (status === 'active' || status === 'canceling') return true;
  if (status === 'trialing') {
    const ends = coach.trial_ends_at ? new Date(coach.trial_ends_at) : null;
    return !!(ends && ends > new Date());
  }
  return false;
}

// Pull just the safe, display-oriented branding bits off the gym owner's row.
// Defensive: any field that doesn't exist simply comes back undefined.
function brandingFrom(coach) {
  if (!coach) return {};
  return {
    gymName: coach.business_name || coach.gym_name || coach.name || null,
    logoUrl: coach.brand_logo_url || coach.logo_url || coach.profile_photo_url || null,
    brandColor: coach.brand_color || coach.primary_color || null
  };
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return json(500, { error: 'Server configuration error' });
  }

  // resolveGymContext handles auth (bearer token) itself.
  const ctx = await resolveGymContext(event);
  if (ctx.error) return ctx.error;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Load the GYM OWNER's coach row (for owners this is themselves). Branding +
    // subscription always come from the owner, which is exactly what a trainer
    // should inherit.
    const { data: ownerCoach } = await supabase
      .from('coaches')
      .select('*')
      .eq('id', ctx.gymCoachId)
      .maybeSingle();

    const branding = brandingFrom(ownerCoach);

    if (ctx.role === 'owner') {
      return json(200, {
        role: 'owner',
        gymCoachId: ctx.gymCoachId,
        trainerId: null,
        canCreateClients: true,
        subscriptionOk: subscriptionOk(ownerCoach),
        ...branding
      });
    }

    // Trainer
    return json(200, {
      role: 'trainer',
      gymCoachId: ctx.gymCoachId,
      trainerId: ctx.trainerId,
      trainerName: ctx.trainer?.name || null,
      canCreateClients: ctx.trainer?.can_create_clients !== false,
      subscriptionOk: subscriptionOk(ownerCoach),
      ...branding
    });
  } catch (err) {
    console.error('gym-context error:', err);
    return json(500, { error: err.message });
  }
};
