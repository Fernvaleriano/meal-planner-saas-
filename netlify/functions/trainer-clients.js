// Netlify Function: clients for the multi-trainer "gym owns, trainer borrows" model.
//
// A gym owner OWNS every client (clients.coach_id = gym owner's id). A trainer
// working under that gym only ever sees/creates clients that are ASSIGNED to
// them (clients.trainer_id = the trainer's gym_trainers.id). Ownership never
// moves to the trainer — if a trainer leaves, their clients stay with the gym.
//
// SAFETY / DESIGN:
//   * resolveGymContext decides who the caller is:
//       - owner   → gymCoachId = self, trainerId = null (sees ALL gym clients)
//       - trainer → gymCoachId = the gym they belong to, trainerId = theirs
//                   (scoped to clients where trainer_id = trainerId)
//   * Runs with the service key, so it does NOT depend on per-table RLS for the
//     trainer path. All scoping is enforced here in code.
//   * Create always sets coach_id = gymCoachId (the gym) and, for a trainer,
//     trainer_id = the trainer — so a trainer can add clients but never owns them.
//   * The gym's plan client-limit is enforced against the gym's TOTAL client
//     count, exactly like create-client.js.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, resolveGymContext, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

// Same tiers as create-client.js — kept in sync intentionally.
const CLIENT_LIMITS = {
  free: 3, starter: 10, growth: 50, scale: 100, professional: 200,
  basic: 10, branded: 200
};

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (!SUPABASE_SERVICE_KEY) return json(500, { error: 'Server configuration error' });

  // Who is calling? (owner or trainer, and which gym.)
  const ctx = await resolveGymContext(event);
  if (ctx.error) return ctx.error;
  if (!ctx.gymCoachId) return json(403, { error: 'Not a coach or trainer' });

  const { role, gymCoachId, trainerId, trainer } = ctx;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ----------------------------------------------------------------
    // GET — list clients (trainer: only theirs; owner: all)
    // ----------------------------------------------------------------
    if (event.httpMethod === 'GET') {
      let query = supabase
        .from('clients')
        .select('id, client_name, email, phone, trainer_id, is_archived, created_at, user_id')
        .eq('coach_id', gymCoachId)
        .order('client_name', { ascending: true });

      if (role === 'trainer') query = query.eq('trainer_id', trainerId);

      const { data, error } = await query;
      if (error) throw error;
      const clients = (data || []).filter(c => !c.is_archived);

      // The trainer can't read the gym's coach row (RLS), so surface the gym's
      // display name + this trainer's own name/permissions here.
      const { data: gym } = await supabase
        .from('coaches')
        .select('brand_name, brand_app_name, name, brand_logo_url')
        .eq('id', gymCoachId).maybeSingle();
      const gymName = (gym && (gym.brand_name || gym.brand_app_name || gym.name)) || 'Your gym';

      return json(200, {
        role,
        clients,
        gym: { name: gymName, logo: gym ? gym.brand_logo_url : null },
        me: trainer ? { name: trainer.name, email: trainer.email, canCreateClients: trainer.can_create_clients !== false } : null
      });
    }

    // ----------------------------------------------------------------
    // POST — add a client (owned by the gym, assigned to the trainer)
    // ----------------------------------------------------------------
    if (event.httpMethod === 'POST') {
      // A trainer whose owner switched off "can create clients" is blocked.
      if (role === 'trainer' && trainer && trainer.can_create_clients === false) {
        return json(403, { error: 'Your gym has not enabled adding clients for you.', code: 'TRAINER_CANNOT_CREATE' });
      }

      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid JSON body' }); }

      const clientName = (body.clientName || '').trim();
      const email = (body.email || '').trim().toLowerCase() || null;
      const phone = (body.phone || '').trim() || null;
      const notes = (body.notes || '').trim() || null;
      const password = body.password;

      if (!clientName) return json(400, { error: 'Client name is required' });

      // Enforce the GYM's plan limit against the gym's total client count.
      const { data: gym } = await supabase
        .from('coaches').select('subscription_tier').eq('id', gymCoachId).single();
      const { count: currentCount, error: countErr } = await supabase
        .from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', gymCoachId);
      if (countErr) throw countErr;
      const tier = (gym && gym.subscription_tier) || 'starter';
      const limit = CLIENT_LIMITS[tier] || 10;
      if (currentCount >= limit) {
        return json(403, {
          error: `The gym has reached its plan limit of ${limit} clients.`,
          code: 'CLIENT_LIMIT_REACHED', currentCount, limit, tier
        });
      }

      // Guard: don't let a coach email be turned into a client.
      if (email) {
        const { data: existingCoach } = await supabase
          .from('coaches').select('id').ilike('email', email).maybeSingle();
        if (existingCoach) {
          return json(400, { error: 'That email is already a coach account. Use a different email.', code: 'EMAIL_IS_COACH' });
        }
      }

      // Optionally create the client's login now (mirrors create-client.js).
      let authUserId = null;
      if (password) {
        if (!email) return json(400, { error: 'Email is required to create a login.', code: 'EMAIL_REQUIRED_FOR_ACCOUNT' });
        if (String(password).length < 6) return json(400, { error: 'Password must be at least 6 characters', code: 'PASSWORD_TOO_SHORT' });
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email, password, email_confirm: true
        });
        if (authErr) {
          if (/already|exists|registered/i.test(authErr.message)) {
            return json(400, { error: 'That email is already registered. Use a different email.', code: 'EMAIL_EXISTS' });
          }
          throw authErr;
        }
        authUserId = authData.user.id;
      }

      // A trainer's client is always assigned to them. An owner may assign to a
      // specific trainer, but only one that belongs to this gym.
      let assignTrainerId = role === 'trainer' ? trainerId : null;
      if (role !== 'trainer' && body.trainerId != null) {
        const { data: vt } = await supabase.from('gym_trainers')
          .select('id').eq('id', body.trainerId).eq('gym_coach_id', gymCoachId).maybeSingle();
        assignTrainerId = vt ? body.trainerId : null;
      }

      const { data: created, error: insErr } = await supabase
        .from('clients')
        .insert([{
          coach_id: gymCoachId,                                   // gym owns it
          trainer_id: assignTrainerId,                            // trainer borrows it
          client_name: clientName,
          email,
          phone,
          notes,
          email_verified_at: email ? new Date().toISOString() : null,
          user_id: authUserId,
          registered_at: authUserId ? new Date().toISOString() : null
        }])
        .select('id, client_name, email, phone, trainer_id')
        .single();

      if (insErr) {
        // Roll back the login we just created so a failed insert leaves no orphan.
        if (authUserId) { try { await supabase.auth.admin.deleteUser(authUserId); } catch (e) { /* ignore */ } }
        throw insErr;
      }

      return json(200, { success: true, client: created, accountCreated: !!authUserId });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('trainer-clients error:', err);
    return json(500, { error: err.message });
  }
};
