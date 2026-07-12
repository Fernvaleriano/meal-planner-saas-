// Netlify Function: manage a gym's trainers (multi-trainer feature, Phase 1).
//
// A "gym" is an existing coach account (the gym owner). This endpoint lets that
// owner add trainers (each with their own login) and assign clients to them.
//
// SAFETY:
//   * OWNER-ONLY. Every path authenticates the caller as the gym owner
//     (authenticateCoach) — trainers cannot reach these actions.
//   * Gated on multi_trainer_enabled (or the founder beta emails). With the
//     flag off this function refuses everything, so it can't affect anyone.
//   * Client assignment only ever writes clients.trainer_id. It never touches
//     coach_id, so the owner keeps ownership of every client no matter what.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Founder accounts can use multi-trainer even before the DB flag is flipped,
// mirroring the gym-features.js beta pattern.
const BETA_OWNERS = [
  'valeriano_fernando@yahoo.com',
  'contact@ziquefitness.com'
];

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

function json(statusCode, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

// Is multi-trainer enabled for this gym owner? (DB flag OR beta email.)
async function isEnabled(supabase, coachId) {
  const { data: settings } = await supabase
    .from('coach_settings')
    .select('multi_trainer_enabled')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (settings?.multi_trainer_enabled) return true;

  try {
    const { data: userData } = await supabase.auth.admin.getUserById(coachId);
    const email = userData?.user?.email?.toLowerCase();
    if (email && BETA_OWNERS.includes(email)) return true;
  } catch (e) { /* ignore */ }
  return false;
}

// Find an existing auth user by email (admin listUsers, filtered). Returns the
// user object or null. Used to promote an already-registered person to trainer.
async function findAuthUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  // listUsers is paginated; scan a few pages defensively.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const match = data.users.find(u => (u.email || '').toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (!SUPABASE_SERVICE_KEY) {
    return json(500, { error: 'Server configuration error' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const qs = event.queryStringParameters || {};

  // Resolve the gym owner id from query (GET/DELETE) or body (POST/PUT).
  let body = {};
  if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid JSON body' }); }
  }
  const coachId = qs.coachId || body.coachId;

  if (!coachId) {
    return json(400, { error: 'coachId is required' });
  }

  // OWNER-ONLY: the caller must be the gym owner account itself.
  const { error: authError } = await authenticateCoach(event, coachId);
  if (authError) return authError;

  // Feature gate.
  if (!(await isEnabled(supabase, coachId))) {
    return json(403, { error: 'Multi-trainer is not enabled for this account', code: 'MULTI_TRAINER_DISABLED' });
  }

  try {
    // ----------------------------------------------------------------
    // GET
    // ----------------------------------------------------------------
    if (event.httpMethod === 'GET') {
      // resource=clients → list gym clients + their current trainer assignment
      if (qs.resource === 'clients') {
        const { data: clients, error } = await supabase
          .from('clients')
          .select('id, client_name, email, trainer_id, archived')
          .eq('coach_id', coachId)
          .order('client_name', { ascending: true });
        if (error) throw error;
        return json(200, { clients: (clients || []).filter(c => !c.archived) });
      }

      // default → list trainers, with a client count each
      const { data: trainers, error } = await supabase
        .from('gym_trainers')
        .select('*')
        .eq('gym_coach_id', coachId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Count clients per trainer in one pass.
      const { data: clientRows } = await supabase
        .from('clients')
        .select('trainer_id')
        .eq('coach_id', coachId);
      const counts = {};
      for (const c of (clientRows || [])) {
        if (c.trainer_id != null) counts[c.trainer_id] = (counts[c.trainer_id] || 0) + 1;
      }
      const withCounts = (trainers || []).map(t => ({ ...t, client_count: counts[t.id] || 0 }));
      return json(200, { trainers: withCounts });
    }

    // ----------------------------------------------------------------
    // POST — action=create (add a trainer) | action=assign (client→trainer)
    // ----------------------------------------------------------------
    if (event.httpMethod === 'POST') {
      const action = body.action || 'create';

      // -- Assign one or more clients to a trainer (or unassign with null) -----
      if (action === 'assign') {
        const trainerId = body.trainerId != null ? body.trainerId : null; // null = back to owner
        const clientIds = Array.isArray(body.clientIds)
          ? body.clientIds
          : (body.clientId != null ? [body.clientId] : []);
        if (clientIds.length === 0) {
          return json(400, { error: 'clientId or clientIds is required' });
        }

        // If assigning to a trainer, verify that trainer belongs to this gym.
        if (trainerId != null) {
          const { data: t } = await supabase
            .from('gym_trainers')
            .select('id')
            .eq('id', trainerId)
            .eq('gym_coach_id', coachId)
            .maybeSingle();
          if (!t) return json(400, { error: 'Trainer not found for this gym' });
        }

        // Only touch clients that belong to this gym (coach_id guard) — and only
        // trainer_id, never coach_id.
        const { data: updated, error } = await supabase
          .from('clients')
          .update({ trainer_id: trainerId })
          .eq('coach_id', coachId)
          .in('id', clientIds)
          .select('id, trainer_id');
        if (error) throw error;
        return json(200, { success: true, updated: updated || [] });
      }

      // -- Create / invite a trainer ------------------------------------------
      if (action === 'create') {
        const email = (body.email || '').trim().toLowerCase();
        const name = (body.name || '').trim() || null;
        const password = body.password;
        const canCreateClients = body.canCreateClients !== false;

        if (!email) return json(400, { error: 'email is required' });

        // Don't let a gym add its own owner as a trainer.
        const { data: ownerUser } = await supabase.auth.admin.getUserById(coachId);
        if (ownerUser?.user?.email && ownerUser.user.email.toLowerCase() === email) {
          return json(400, { error: 'You are already the gym owner — no need to add yourself as a trainer.' });
        }

        // Already a trainer at this gym?
        const { data: existingTrainer } = await supabase
          .from('gym_trainers')
          .select('id')
          .eq('gym_coach_id', coachId)
          .eq('email', email)
          .maybeSingle();
        if (existingTrainer) {
          return json(400, { error: 'A trainer with this email already exists in your gym.', code: 'TRAINER_EXISTS' });
        }

        // Resolve (or create) the trainer's login.
        let trainerUserId = null;
        let tempPassword = null;
        const pw = password && password.length >= 6
          ? password
          : (tempPassword = 'Zq' + Math.abs(hashCode(email + coachId)).toString(36) + 'x!');

        const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: pw,
          email_confirm: true
        });

        if (!createErr) {
          trainerUserId = authData.user.id;
        } else if (/already|exists|registered/i.test(createErr.message)) {
          // Email already has a login. Promote it to trainer IF it isn't itself
          // a coach account (avoid cross-gym ownership tangles in phase 1).
          const existing = await findAuthUserByEmail(supabase, email);
          if (!existing) {
            return json(400, { error: 'That email is already registered but could not be linked. Use a different email.' });
          }
          const { data: isCoach } = await supabase
            .from('coaches').select('id').eq('id', existing.id).maybeSingle();
          if (isCoach) {
            return json(400, {
              error: 'That email is already a coach account and can\'t be added as a trainer yet.',
              code: 'EMAIL_IS_COACH'
            });
          }
          // Already a trainer somewhere else? Our partial unique index would
          // reject the insert; surface a clean message first.
          const { data: otherTrainer } = await supabase
            .from('gym_trainers').select('id').eq('trainer_user_id', existing.id).maybeSingle();
          if (otherTrainer) {
            return json(400, { error: 'That person is already a trainer at another gym.', code: 'TRAINER_ELSEWHERE' });
          }
          trainerUserId = existing.id;
          tempPassword = null; // we didn't set a password; they keep their own
        } else {
          console.error('createUser error:', createErr);
          return json(500, { error: 'Failed to create trainer login: ' + createErr.message });
        }

        const { data: trainer, error: insErr } = await supabase
          .from('gym_trainers')
          .insert([{
            gym_coach_id: coachId,
            trainer_user_id: trainerUserId,
            email,
            name,
            role: 'trainer',
            status: 'active',
            can_create_clients: canCreateClients
          }])
          .select()
          .single();

        if (insErr) {
          // Roll back the auth user we just created so a failed insert doesn't
          // leave an orphan login (only if WE created it).
          if (trainerUserId && tempPassword) {
            try { await supabase.auth.admin.deleteUser(trainerUserId); } catch (e) { /* ignore */ }
          }
          throw insErr;
        }

        return json(200, { success: true, trainer, tempPassword });
      }

      return json(400, { error: 'Unknown action' });
    }

    // ----------------------------------------------------------------
    // PUT — update a trainer (name, status, permissions)
    // ----------------------------------------------------------------
    if (event.httpMethod === 'PUT') {
      const trainerId = body.trainerId;
      if (!trainerId) return json(400, { error: 'trainerId is required' });

      // Scope the update to this gym's trainer.
      const { data: existing } = await supabase
        .from('gym_trainers')
        .select('id')
        .eq('id', trainerId)
        .eq('gym_coach_id', coachId)
        .maybeSingle();
      if (!existing) return json(404, { error: 'Trainer not found' });

      const fields = {};
      if (body.name !== undefined) fields.name = body.name;
      if (body.status !== undefined && ['active', 'disabled', 'invited'].includes(body.status)) fields.status = body.status;
      if (body.canCreateClients !== undefined) fields.can_create_clients = !!body.canCreateClients;
      if (Object.keys(fields).length === 0) return json(400, { error: 'Nothing to update' });

      const { data: trainer, error } = await supabase
        .from('gym_trainers')
        .update(fields)
        .eq('id', trainerId)
        .eq('gym_coach_id', coachId)
        .select()
        .single();
      if (error) throw error;
      return json(200, { success: true, trainer });
    }

    // ----------------------------------------------------------------
    // DELETE — remove a trainer (their clients revert to the owner)
    // ----------------------------------------------------------------
    if (event.httpMethod === 'DELETE') {
      const trainerId = qs.trainerId;
      if (!trainerId) return json(400, { error: 'trainerId is required' });

      // Verify it's this gym's trainer before doing anything.
      const { data: trainer } = await supabase
        .from('gym_trainers')
        .select('id, trainer_user_id')
        .eq('id', trainerId)
        .eq('gym_coach_id', coachId)
        .maybeSingle();
      if (!trainer) return json(404, { error: 'Trainer not found' });

      // clients.trainer_id → NULL happens automatically via ON DELETE SET NULL,
      // so clients are never orphaned — they revert to the owner's direct view.
      const { error } = await supabase
        .from('gym_trainers')
        .delete()
        .eq('id', trainerId)
        .eq('gym_coach_id', coachId);
      if (error) throw error;

      // NOTE (phase 1): we intentionally do NOT delete the trainer's auth login
      // here — a login may be reused and hard-deleting risks collateral. The
      // trainer simply loses gym access (no active gym_trainers row). Cleaning
      // up the orphaned auth user can be a later admin action.
      return json(200, { success: true });
    }

    return json(405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('gym-trainers error:', err);
    return json(500, { error: err.message });
  }
};

// Small deterministic hash for generating a readable temp password (no
// Math.random dependency; stable per email+gym). Not a security primitive —
// the trainer should change it on first login.
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
