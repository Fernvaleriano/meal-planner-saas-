// Post-OAuth bootstrap (Google sign-in, July 2026).
//
// After an OAuth sign-in the browser has a valid session but the app doesn't
// yet know WHO this is in product terms. This endpoint resolves the caller to
// a role and performs the two safe fix-ups OAuth needs:
//   - link a pending client invite (clients row with matching email and no
//     user_id yet) to the fresh OAuth login, and
//   - with explicit intent 'signup-coach' (the signup page only), create a
//     free coach account for a brand-new login.
// A stranger Googling in through a login page gets { role: null } and the
// page signs them out — no account is created without signup intent.
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateRequest, checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const ok = (body) => ({ statusCode: 200, headers, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { user, error: authError } = await authenticateRequest(event);
  if (authError) return authError;

  const rateLimit = await checkRateLimitDurable(user.id, 'oauth-bootstrap', 20, 10 * 60 * 1000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let intent = null;
    try { intent = (JSON.parse(event.body || '{}').intent) || null; } catch (e) { /* no body */ }

    // 1. Coach/gym owner?
    const { data: coachRow } = await supabase
      .from('coaches')
      .select('id, is_gym')
      .eq('id', user.id)
      .maybeSingle();
    if (coachRow) return ok({ role: 'coach', isGym: !!coachRow.is_gym });

    // 2. Gym trainer?
    const { data: trainerRow } = await supabase
      .from('gym_trainers')
      .select('id')
      .eq('trainer_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (trainerRow) return ok({ role: 'trainer' });

    // 3. Client already linked to this login?
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (clientRow) return ok({ role: 'client' });

    // 4. Pending client invite with this (provider-verified) email? Link it,
    //    so an invited client's first Google sign-in just works. Only rows
    //    that were never linked to any login are eligible.
    const email = (user.email || '').toLowerCase().trim();
    const emailVerified = !!(user.email_confirmed_at || user.confirmed_at);
    if (email && emailVerified) {
      const { data: pending } = await supabase
        .from('clients')
        .select('id')
        .ilike('email', email)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending) {
        const { error: linkError } = await supabase
          .from('clients')
          .update({ user_id: user.id })
          .eq('id', pending.id)
          .is('user_id', null);
        if (!linkError) return ok({ role: 'client', linked: true });
      }
    }

    // 5. Brand-new login. Only the signup page's explicit intent creates an
    //    account — a login page never does.
    if (intent === 'signup-coach') {
      const name = user.user_metadata?.full_name || user.user_metadata?.name || (email ? email.split('@')[0] : 'Coach');
      const { error: createError } = await supabase
        .from('coaches')
        .insert({
          id: user.id,
          email: email || user.email,
          name,
          subscription_tier: 'free',
          subscription_status: 'active',
          created_at: new Date().toISOString()
        });
      if (createError) {
        console.error('oauth-bootstrap: coach creation failed:', createError.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not create your account. Please try again.' }) };
      }
      try {
        await supabase.from('usage_events').insert({
          event: 'signup_completed', page: '/signup.html', role: 'coach', user_id: user.id
        });
      } catch (e) { /* analytics never blocks signup */ }
      return ok({ role: 'coach', isGym: false, created: true });
    }

    return ok({ role: null });
  } catch (err) {
    console.error('oauth-bootstrap error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Sign-in check failed. Please try again.' }) };
  }
};
