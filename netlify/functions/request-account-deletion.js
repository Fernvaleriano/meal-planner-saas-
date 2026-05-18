/**
 * Request Account Deletion  (GDPR Phase 2 — right to erasure)
 *
 * Lets an authenticated user request deletion of THEIR OWN account.
 *
 * This is a SOFT delete + lockout, on purpose:
 *   - It marks deletion_requested_at / deleted_at and stops access.
 *   - It does NOT erase any rows. Permanent erasure is a separate,
 *     later, carefully-built step. Nothing here is irreversible within
 *     the 30-day grace window.
 *
 * Identity is derived SOLELY from the verified auth token (same model as
 * export-my-data.js): no id is accepted from the request, so a user can
 * only ever delete their own account.
 *
 * Coach rule (decided — "Option C"): a coach with active clients CANNOT
 * delete their coaching account. They must offboard/archive their
 * clients first. This protects the clients' own data and billing.
 */

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GRACE_DAYS = 30;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return json(500, { error: 'Server configuration error' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required' });
  }
  const token = authHeader.replace('Bearer ', '');

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const { data: { user } = {}, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return json(401, { error: 'Invalid token' });
  }

  try {
    const nowIso = new Date().toISOString();

    // Resolve identity from the token only.
    const { data: clientRow } = await admin
      .from('clients')
      .select('id, coach_id, deleted_at')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id, deleted_at, stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!clientRow && !coachRow) {
      return json(404, { error: 'No account found for this user' });
    }
    if (clientRow?.deleted_at || coachRow?.deleted_at) {
      return json(409, {
        error: 'This account is already scheduled for deletion. ' +
               'Contact contact@ziquecoach.com to cancel.'
      });
    }

    // Option C: a coach with active clients cannot delete.
    if (coachRow) {
      const { count: activeClients } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachRow.id)
        .eq('is_archived', false)
        .is('deleted_at', null);
      if ((activeClients || 0) > 0) {
        return json(409, {
          error: `You still have ${activeClients} active client(s). ` +
                 `Archive or offboard your clients before deleting your ` +
                 `coaching account. (Your clients' data and billing must ` +
                 `be wound down first.)`
        });
      }
    }

    const stripeResults = [];

    if (clientRow) {
      // Stop billing (best-effort): cancel any active client subscription
      // at period end. A Stripe hiccup must not block the deletion request.
      try {
        const { data: subs } = await admin
          .from('client_subscriptions')
          .select('stripe_subscription_id, status')
          .eq('client_id', clientRow.id);
        for (const s of subs || []) {
          if (s.stripe_subscription_id && s.status !== 'canceled') {
            await stripe.subscriptions.update(s.stripe_subscription_id, {
              cancel_at_period_end: true
            });
            stripeResults.push({ sub: s.stripe_subscription_id, ok: true });
          }
        }
      } catch (e) {
        stripeResults.push({ ok: false, error: e.message });
      }

      // Soft-delete + immediate lockout via the EXISTING access gate
      // (access_status='paused' is already enforced app-wide by migration 008).
      await admin.from('clients').update({
        deletion_requested_at: nowIso,
        deleted_at: nowIso,
        access_status: 'paused'
      }).eq('id', clientRow.id);
    }

    if (coachRow) {
      try {
        if (coachRow.stripe_subscription_id) {
          await stripe.subscriptions.update(coachRow.stripe_subscription_id, {
            cancel_at_period_end: true
          });
          stripeResults.push({ sub: coachRow.stripe_subscription_id, ok: true });
        }
      } catch (e) {
        stripeResults.push({ ok: false, error: e.message });
      }
      await admin.from('coaches').update({
        deletion_requested_at: nowIso,
        deleted_at: nowIso
      }).eq('id', coachRow.id);
    }

    // Revoke all sessions → user is logged out everywhere immediately.
    try {
      await admin.auth.admin.signOut(user.id, 'global');
    } catch (e) {
      console.error('signOut failed (non-fatal):', e.message);
    }

    // Append-only audit entry (service role; table is append-only by RLS).
    await admin.from('audit_log').insert({
      actor_id: user.id,
      tenant_id: clientRow ? (clientRow.coach_id || null) : user.id,
      action: 'account_deletion_requested',
      target_type: clientRow ? 'client' : 'coach',
      target_id: String(clientRow ? clientRow.id : coachRow.id),
      ip: event.headers['x-nf-client-connection-ip'] ||
          event.headers['client-ip'] || null,
      metadata: { grace_days: GRACE_DAYS, stripe: stripeResults }
    });

    // Confirmation email (best-effort).
    await sendDeletionEmail(user.email);

    return json(200, {
      success: true,
      message: `Your account is scheduled for deletion in ${GRACE_DAYS} days ` +
               `and you have been signed out. To cancel, email ` +
               `contact@ziquecoach.com within ${GRACE_DAYS} days.`
    });

  } catch (error) {
    console.error('request-account-deletion error:', error);
    return json(500, { error: 'Could not process the deletion request' });
  }
};

async function sendDeletionEmail(to) {
  if (!to || !process.env.RESEND_API_KEY) return;
  const emailFrom = process.env.EMAIL_FROM || 'noreply@ziquecoach.com';
  const emailFromName = process.env.EMAIL_FROM_NAME || 'Ziquecoach';
  const text =
    `We received a request to delete your Ziquecoach account.\n\n` +
    `Your account is now deactivated and will be permanently deleted ` +
    `in ${GRACE_DAYS} days.\n\n` +
    `If you did NOT request this, or you change your mind, email ` +
    `contact@ziquecoach.com within ${GRACE_DAYS} days and we will ` +
    `restore your account.`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${emailFromName} <${emailFrom}>`,
        to: [to],
        subject: 'Your Ziquecoach account deletion request',
        text
      })
    });
  } catch (e) {
    console.error('deletion email failed (non-fatal):', e.message);
  }
}
