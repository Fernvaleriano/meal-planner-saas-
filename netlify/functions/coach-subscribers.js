/**
 * Coach Subscribers
 *
 * GET  — Returns every client subscription for this coach, joined with
 *        client name + plan name + last-payment info. Powers the
 *        Subscribers section of the coach billing dashboard.
 * POST — Coach-initiated actions on a specific subscription:
 *          - cancel: cancels the client's subscription at period end.
 *        (Refunds are handled by coach-refund-payment.js.)
 *
 * All operations run on the coach's connected Stripe account.
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    if (event.httpMethod === 'GET') {
      // !plan_id qualifier is required — client_subscriptions has two FKs
      // to coach_payment_plans (plan_id and pending_plan_id, added in
      // migration 006). Without it PostgREST returns no rows.
      const { data: subs, error } = await supabase
        .from('client_subscriptions')
        .select(`
          id, client_id, plan_id, status, stripe_subscription_id,
          current_period_start, current_period_end, trial_ends_at,
          canceled_at, cancel_at, pending_plan_id, pending_change_effective_at,
          created_at,
          coach_payment_plans!plan_id(id, name, price_cents, billing_interval),
          pending_plan:coach_payment_plans!pending_plan_id(id, name, price_cents, billing_interval)
        `)
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: error.message })
        };
      }

      // Enrich with client names + last payment per subscription.
      const clientIds = [...new Set((subs || []).map(s => s.client_id))];
      const subIds = (subs || []).map(s => s.id);

      const [clientsRes, paymentsRes] = await Promise.all([
        clientIds.length
          ? supabase.from('clients').select('id, client_name, email').in('id', clientIds)
          : Promise.resolve({ data: [] }),
        subIds.length
          ? supabase
              .from('client_payments')
              .select('subscription_id, amount_cents, status, created_at')
              .in('subscription_id', subIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] })
      ]);

      const clientById = new Map((clientsRes.data || []).map(c => [c.id, c]));
      const lastPaymentBySub = new Map();
      for (const p of (paymentsRes.data || [])) {
        if (!lastPaymentBySub.has(p.subscription_id)) {
          lastPaymentBySub.set(p.subscription_id, p);
        }
      }

      const enriched = (subs || []).map(s => ({
        ...s,
        client_name: clientById.get(s.client_id)?.client_name || null,
        client_email: clientById.get(s.client_id)?.email || null,
        last_payment: lastPaymentBySub.get(s.id) || null
      }));

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ subscribers: enriched })
      };
    }

    if (event.httpMethod === 'POST') {
      const { action, subscriptionId } = JSON.parse(event.body || '{}');

      if (!subscriptionId) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'subscriptionId is required' })
        };
      }

      // Ownership check — must be this coach's subscription.
      const { data: sub } = await supabase
        .from('client_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('coach_id', user.id)
        .single();

      if (!sub) {
        return {
          statusCode: 404, headers: corsHeaders,
          body: JSON.stringify({ error: 'Subscription not found' })
        };
      }

      const { data: coach } = await supabase
        .from('coaches')
        .select('stripe_connect_account_id')
        .eq('id', user.id)
        .single();

      if (!coach?.stripe_connect_account_id) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'Stripe Connect account not found' })
        };
      }

      const stripeAccount = coach.stripe_connect_account_id;

      if (action === 'cancel') {
        if (!sub.stripe_subscription_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'Subscription has no Stripe ID' })
          };
        }

        if (['canceled', 'canceling'].includes(sub.status)) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'Already canceled or canceling' })
          };
        }

        // If there's a pending plan schedule, release it first — Stripe
        // disallows direct subscription edits while a schedule is active.
        if (sub.stripe_schedule_id) {
          try {
            await stripe.subscriptionSchedules.release(
              sub.stripe_schedule_id,
              {},
              { stripeAccount }
            );
          } catch (err) {
            console.warn('Could not release schedule on coach-cancel:', err.message);
          }
        }

        const updated = await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { cancel_at_period_end: true },
          { stripeAccount }
        );

        const cancelDate = new Date(updated.current_period_end * 1000);

        const { error: updErr } = await supabase
          .from('client_subscriptions')
          .update({
            status: 'canceling',
            cancel_at: cancelDate.toISOString(),
            canceled_at: new Date().toISOString(),
            pending_plan_id: null,
            pending_change_effective_at: null,
            stripe_schedule_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);
        if (updErr) {
          console.error('Failed to mark coach-canceled subscription:', updErr);
          throw updErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            cancelAt: cancelDate.toISOString(),
            message: 'Client subscription will cancel at end of billing period'
          })
        };
      }

      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid action. Use: cancel' })
      };
    }

    return {
      statusCode: 405, headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Coach subscribers error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
