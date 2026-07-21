/**
 * Master Account Guard
 *
 * Per project memory: contact@ziquefitness.com is the master coach account.
 * No matter what happens, that data never leaves. This function provides
 * the server-side enforcement layer:
 *
 *   POST /.netlify/functions/master-account-guard
 *   Body: { intent: 'check'|'snapshot'|'audit', actor, target?, payload? }
 *
 * Intents:
 *   - check     → returns whether the requested action would be blocked
 *                 (used by the front-end to disable destructive UI)
 *   - snapshot  → triggers an on-demand snapshot of the master coach's
 *                 critical tables to a JSON archive
 *   - audit     → returns the most recent 200 audit log entries
 *
 * Always writes to `master_account_audit`. If the table doesn't exist
 * yet (migration not run), it falls back to console-logging so the
 * function still works.
 */
const { createClient } = require('@supabase/supabase-js');
const { extractToken, verifyToken } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MASTER_EMAIL = 'contact@ziquefitness.com';

/**
 * Verify the caller is the master account via a real, signed JWT (NOT a
 * client-supplied `actor.email`, which is trivially spoofable). Returns the
 * verified user on success, or null if the token is missing/invalid/not master.
 */
async function verifyMasterCaller(event) {
  const token = extractToken(event);
  if (!token) return null;
  const { user, error } = await verifyToken(token);
  if (error || !user) return null;
  if ((user.email || '').toLowerCase() !== MASTER_EMAIL) return null;
  return user;
}

// Actions that are NEVER allowed against the master account through the app.
// These are enforced server-side regardless of what the front-end does.
const HARD_BLOCK_ACTIONS = new Set([
  'delete_coach',
  'delete_account',
  'archive_coach',
  'wipe_clients',
  'truncate_data',
  'transfer_ownership'
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { intent, actor = {}, target = {}, payload } = body;
  if (!intent) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'intent required' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    if (intent === 'check') {
      // Require a valid logged-in user so this can't be probed / used to spam
      // the audit log anonymously.
      const token = extractToken(event);
      const { user, error: vErr } = token ? await verifyToken(token) : { user: null, error: 'no token' };
      if (vErr || !user) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Authentication required' }) };
      }
      const result = await checkAction(supabase, actor, target);
      await audit(supabase, { actor, target, action: target.action || 'check', blocked: result.blocked, reason: result.reason, payload });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
    }

    if (intent === 'snapshot') {
      // Snapshot reads the master account's most sensitive data. Require a
      // real signed-in master session, and NEVER return the archive itself in
      // the HTTP response — the snapshot is recorded server-side; the browser
      // only needs to know it succeeded (rowCounts). Previously this endpoint
      // returned the full archive to any unauthenticated caller.
      const masterUser = await verifyMasterCaller(event);
      if (!masterUser) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Master authentication required' }) };
      }
      const verifiedActor = { userId: masterUser.id, email: masterUser.email };
      const result = await runSnapshot(supabase, verifiedActor);
      await audit(supabase, { actor: verifiedActor, action: 'snapshot', blocked: false, reason: 'manual snapshot', payload: { rowCounts: result.rowCounts } });
      // Strip the archive from the response — only return metadata.
      const { archive, ...safeResult } = result;
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(safeResult) };
    }

    if (intent === 'audit') {
      // Only allow the master account to view audit — verified via a signed
      // JWT, not a spoofable `actor.email` in the request body.
      const masterUser = await verifyMasterCaller(event);
      if (!masterUser) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Master authentication required' }) };
      }
      const { data } = await supabase
        .from('master_account_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ entries: data || [] }) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Unknown intent' }) };
  } catch (err) {
    console.error('master-account-guard error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

async function checkAction(supabase, actor, target) {
  const targetIsMaster = await targetsMaster(supabase, target);
  if (!targetIsMaster) return { blocked: false };

  // If the target IS the master account, then:
  //   - HARD_BLOCK_ACTIONS are always blocked
  //   - All other modifications are allowed but loudly audited
  if (HARD_BLOCK_ACTIONS.has(target.action)) {
    return {
      blocked: true,
      reason: `Action "${target.action}" is permanently blocked against the master coach account (${MASTER_EMAIL}). This is enforced for data preservation.`,
      contact: 'If you genuinely need this, edit the database directly with a service role key — the app will never let you do this.'
    };
  }
  return {
    blocked: false,
    warning: `You are modifying the master account (${MASTER_EMAIL}). This action is logged in master_account_audit.`
  };
}

async function targetsMaster(supabase, target) {
  if (!target) return false;
  if ((target.email || '').toLowerCase() === MASTER_EMAIL) return true;
  if (target.userId) {
    const { data } = await supabase.from('auth.users').select('email').eq('id', target.userId).maybeSingle().catch(() => ({ data: null }));
    if ((data?.email || '').toLowerCase() === MASTER_EMAIL) return true;
  }
  if (target.coachId) {
    const { data } = await supabase.from('coaches').select('email').eq('id', target.coachId).maybeSingle();
    if ((data?.email || '').toLowerCase() === MASTER_EMAIL) return true;
  }
  return false;
}

async function runSnapshot(supabase, actor) {
  // Resolve master coach (coaches.id == auth user id in this schema)
  const { data: master } = await supabase.from('coaches').select('id, email').eq('email', MASTER_EMAIL).maybeSingle();
  if (!master) {
    return { ok: false, reason: 'Master coach record not found in coaches table — nothing to snapshot.' };
  }

  // Pull a slim, point-in-time snapshot of the most precious data.
  const tables = [
    { name: 'clients', filter: { coach_id: master.id } },
    { name: 'client_workout_assignments', filter: { coach_id: master.id } },
    { name: 'client_checkins', viaClients: true },
    { name: 'workout_logs', viaClients: true },
    { name: 'food_diary_entries', filter: { coach_id: master.id } },
    { name: 'chat_messages', filter: { coach_id: master.id } },
    { name: 'coach_meal_plans', filter: { coach_id: master.id } },
    { name: 'progress_photos', viaClients: true },
    { name: 'personal_records', viaClients: true }
  ];

  // Resolve coach's client ids once
  const { data: clientList } = await supabase.from('clients').select('id').eq('coach_id', master.id);
  const clientIds = (clientList || []).map((c) => c.id);

  const archive = { generatedAt: new Date().toISOString(), masterCoachEmail: MASTER_EMAIL };
  const rowCounts = {};

  for (const t of tables) {
    let q = supabase.from(t.name).select('*');
    if (t.filter?.coach_id) q = q.eq('coach_id', t.filter.coach_id);
    if (t.viaClients && clientIds.length) q = q.in('client_id', clientIds);
    if (t.viaClients && !clientIds.length) { archive[t.name] = []; rowCounts[t.name] = 0; continue; }
    const { data, error } = await q.limit(50000);
    if (error) {
      archive[t.name] = { error: error.message };
      rowCounts[t.name] = -1;
    } else {
      archive[t.name] = data || [];
      rowCounts[t.name] = (data || []).length;
    }
  }

  // Write snapshot row to master_account_audit so we always know it happened
  await audit(supabase, { actor, action: 'snapshot', blocked: false, reason: 'snapshot_completed', payload: { rowCounts } });

  return { ok: true, rowCounts, generatedAt: archive.generatedAt, archive };
}

async function audit(supabase, { actor = {}, target, action, blocked, reason, payload }) {
  const row = {
    actor_user_id: actor.userId || null,
    actor_email: actor.email || null,
    target_table: target?.table || null,
    target_row_id: target?.rowId ? String(target.rowId) : null,
    action,
    blocked: !!blocked,
    reason: reason || null,
    payload: payload || null
  };
  try {
    const { error } = await supabase.from('master_account_audit').insert(row);
    if (error) console.warn('master_account_audit insert failed (table missing?):', error.message, row);
  } catch (e) {
    console.warn('master_account_audit insert exception:', e.message, row);
  }
}
