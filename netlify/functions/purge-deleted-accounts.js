/**
 * Purge Deleted Accounts  (GDPR Phase 2 — permanent erasure after grace)
 *
 * Scheduled daily (see netlify.toml). Finds accounts that were soft-deleted
 * (request-account-deletion.js) and whose 30-day grace window has passed,
 * then PERMANENTLY removes them.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  SAFETY MODEL — read before enabling.
 * ──────────────────────────────────────────────────────────────────────
 *  - DRY-RUN BY DEFAULT. Unless env PURGE_LIVE === 'true', this function
 *    only IDENTIFIES and logs what *would* be purged and deletes NOTHING.
 *    Deploying it does not destroy any data. Flip PURGE_LIVE to 'true' in
 *    Netlify when you are ready for real, irreversible deletion.
 *  - Only purges rows where deleted_at IS NOT NULL AND
 *    deletion_requested_at <= now - 30 days. If an account was restored
 *    during grace (flags cleared), it is skipped automatically.
 *  - MAX_PER_RUN caps blast radius so any bug can only affect a few rows
 *    per day, not everyone at once.
 *  - Every real purge writes an audit_log row BEFORE deleting.
 *  - Reuses the codebase's proven deletion primitive (delete the
 *    clients/coaches row + auth.admin.deleteUser). It does NOT issue a
 *    new hand-rolled sweep across dozens of tables.
 * ──────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const GRACE_DAYS = 30;
const MAX_PER_RUN = 25;
const LIVE = process.env.PURGE_LIVE === 'true';

exports.handler = async (event, context) => {
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Scheduled runs come from Netlify's scheduler. Any other (manual HTTP)
  // trigger of this destructive job must be the master/admin account.
  const isScheduled = context?.clientContext?.custom?.scheduled === true ||
                     event?.headers?.['x-netlify-scheduled'] === 'true';
  if (!isScheduled) {
    const { authenticateMaster } = require('./utils/auth');
    const { error: authError } = await authenticateMaster(event || { headers: {} });
    if (authError) return authError;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 3600 * 1000).toISOString();
  const summary = { mode: LIVE ? 'LIVE' : 'DRY_RUN', cutoff, clients: [], coaches: [], errors: [] };

  try {
    // Candidates: soft-deleted past the grace window.
    const { data: clients } = await admin
      .from('clients')
      .select('id, user_id, coach_id, deletion_requested_at')
      .not('deleted_at', 'is', null)
      .lte('deletion_requested_at', cutoff)
      .limit(MAX_PER_RUN);

    const { data: coaches } = await admin
      .from('coaches')
      .select('id, deletion_requested_at')
      .not('deleted_at', 'is', null)
      .lte('deletion_requested_at', cutoff)
      .limit(MAX_PER_RUN);

    for (const c of clients || []) {
      if (!LIVE) { summary.clients.push({ id: c.id, would_purge: true }); continue; }
      try {
        // Audit FIRST, so there is a record even if deletion partially fails.
        await admin.from('audit_log').insert({
          actor_id: c.user_id || '00000000-0000-0000-0000-000000000000',
          tenant_id: c.coach_id || null,
          action: 'account_purged',
          target_type: 'client',
          target_id: String(c.id),
          metadata: { grace_days: GRACE_DAYS, requested_at: c.deletion_requested_at }
        });
        if (c.user_id) {
          const { error } = await admin.auth.admin.deleteUser(c.user_id);
          if (error) console.warn('auth deleteUser (client) warning:', error.message);
        }
        await admin.from('clients').delete().eq('id', c.id);
        summary.clients.push({ id: c.id, purged: true });
      } catch (e) {
        summary.errors.push({ type: 'client', id: c.id, error: e.message });
      }
    }

    for (const co of coaches || []) {
      if (!LIVE) { summary.coaches.push({ id: co.id, would_purge: true }); continue; }
      try {
        await admin.from('audit_log').insert({
          actor_id: co.id,
          tenant_id: co.id,
          action: 'account_purged',
          target_type: 'coach',
          target_id: String(co.id),
          metadata: { grace_days: GRACE_DAYS, requested_at: co.deletion_requested_at }
        });
        // coaches.id IS the auth user id (verified codebase convention).
        const { error } = await admin.auth.admin.deleteUser(co.id);
        if (error) console.warn('auth deleteUser (coach) warning:', error.message);
        await admin.from('coaches').delete().eq('id', co.id);
        summary.coaches.push({ id: co.id, purged: true });
      } catch (e) {
        summary.errors.push({ type: 'coach', id: co.id, error: e.message });
      }
    }

    console.log('[purge-deleted-accounts]', JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify(summary) };

  } catch (error) {
    console.error('purge-deleted-accounts error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message, summary }) };
  }
};
