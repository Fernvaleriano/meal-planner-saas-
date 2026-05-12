/**
 * Client Subscription Management
 *
 * Allows clients to:
 * - View their current subscription
 * - Cancel their subscription
 * - Access Stripe Customer Portal (update payment, view invoices)
 * - View payment history
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

    // GET - View subscription and payment history
    if (event.httpMethod === 'GET') {
      const coachId = event.queryStringParameters?.coachId;

      // Get client record
      const clientQuery = supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', user.id);

      if (coachId) {
        clientQuery.eq('coach_id', coachId);
      }

      const { data: client } = await clientQuery.single();
      if (!client) {
        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ subscription: null, payments: [], plans: [] })
        };
      }

      // Get active subscription. The !plan_id qualifier is required now
      // that client_subscriptions has two foreign keys to coach_payment_plans
      // (plan_id and pending_plan_id) — without it, PostgREST can't decide
      // which one to follow and returns no data, which the frontend treats
      // as "no subscription" and shows Choose-a-Plan.
      const { data: subscription } = await supabase
        .from('client_subscriptions')
        .select('*, coach_payment_plans!plan_id(*)')
        .eq('client_id', client.id)
        .eq('coach_id', client.coach_id)
        .in('status', ['active', 'trialing', 'past_due', 'canceling', 'paused'])
        .single();

      // Get payment history
      const { data: payments } = await supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', client.id)
        .eq('coach_id', client.coach_id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get available plans for upgrade/downgrade
      const { data: plans } = await supabase
        .from('coach_payment_plans')
        .select('*')
        .eq('coach_id', client.coach_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({
          subscription: subscription || null,
          payments: payments || [],
          plans: plans || []
        })
      };
    }

    // POST - Actions: cancel, portal
    if (event.httpMethod === 'POST') {
      const { action, coachId } = JSON.parse(event.body || '{}');

      // Get client
      const { data: client } = await supabase
        .from('clients')
        .select('id, email, client_name, coach_id')
        .eq('user_id', user.id)
        .eq('coach_id', coachId)
        .single();

      if (!client) {
        return {
          statusCode: 404, headers: corsHeaders,
          body: JSON.stringify({ error: 'Client not found' })
        };
      }

      // Get coach's connected account
      const { data: coach } = await supabase
        .from('coaches')
        .select('stripe_connect_account_id')
        .eq('id', client.coach_id)
        .single();

      if (!coach?.stripe_connect_account_id) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'Coach payment system not available' })
        };
      }

      const stripeAccount = coach.stripe_connect_account_id;

      if (action === 'cancel') {
        // Get active subscription
        const { data: sub } = await supabase
          .from('client_subscriptions')
          .select('*')
          .eq('client_id', client.id)
          .eq('coach_id', client.coach_id)
          .in('status', ['active', 'trialing'])
          .single();

        if (!sub?.stripe_subscription_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'No active subscription to cancel' })
          };
        }

        // If a downgrade is scheduled, release the schedule first — Stripe
        // disallows direct edits to subscriptions managed by an active
        // schedule, and the pending downgrade is moot once we cancel.
        if (sub.stripe_schedule_id) {
          try {
            await stripe.subscriptionSchedules.release(
              sub.stripe_schedule_id,
              {},
              { stripeAccount }
            );
          } catch (err) {
            console.warn('Could not release schedule on cancel:', err.message);
          }
        }

        // Cancel at period end
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
          console.error('Failed to mark subscription canceling:', updErr);
          throw updErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            cancelAt: cancelDate.toISOString(),
            message: 'Subscription will cancel at end of billing period'
          })
        };
      }

      if (action === 'pause') {
        // Pause billing without canceling. Stripe keeps the subscription
        // "active" on its side but stops generating invoices until we
        // resume. We use status='paused' in our DB so coach dashboards
        // and access-gating logic can distinguish a paused client.
        const { data: sub } = await supabase
          .from('client_subscriptions')
          .select('*')
          .eq('client_id', client.id)
          .eq('coach_id', client.coach_id)
          .in('status', ['active', 'trialing'])
          .single();

        if (!sub?.stripe_subscription_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'No active subscription to pause' })
          };
        }

        await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { pause_collection: { behavior: 'mark_uncollectible' } },
          { stripeAccount }
        );

        const { error: updErr } = await supabase
          .from('client_subscriptions')
          .update({
            status: 'paused',
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);
        if (updErr) {
          console.error('Failed to mark subscription paused:', updErr);
          throw updErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Subscription paused. Resume any time — no billing until then.'
          })
        };
      }

      if (action === 'resume') {
        const { data: sub } = await supabase
          .from('client_subscriptions')
          .select('*')
          .eq('client_id', client.id)
          .eq('coach_id', client.coach_id)
          .eq('status', 'paused')
          .single();

        if (!sub?.stripe_subscription_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'No paused subscription to resume' })
          };
        }

        const updated = await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { pause_collection: '' },
          { stripeAccount }
        );

        const { error: updErr } = await supabase
          .from('client_subscriptions')
          .update({
            status: updated.status || 'active',
            current_period_start: new Date(updated.current_period_start * 1000).toISOString(),
            current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);
        if (updErr) {
          console.error('Failed to resume subscription in DB:', updErr);
          throw updErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Subscription resumed'
          })
        };
      }

      if (action === 'reactivate') {
        // Undo a "canceling" subscription before it actually ends.
        // Once the subscription has fully ended (status: canceled), this
        // path isn't usable — the client needs to subscribe afresh.
        const { data: sub } = await supabase
          .from('client_subscriptions')
          .select('*')
          .eq('client_id', client.id)
          .eq('coach_id', client.coach_id)
          .eq('status', 'canceling')
          .single();

        if (!sub?.stripe_subscription_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'No subscription to reactivate' })
          };
        }

        await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { cancel_at_period_end: false },
          { stripeAccount }
        );

        const { error: updErr } = await supabase
          .from('client_subscriptions')
          .update({
            status: 'active',
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);
        if (updErr) {
          console.error('Failed to mark subscription reactivated:', updErr);
          throw updErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Subscription reactivated'
          })
        };
      }

      if (action === 'portal') {
        // Get client's Stripe customer ID on the connected account
        const { data: sub } = await supabase
          .from('client_subscriptions')
          .select('stripe_customer_id')
          .eq('client_id', client.id)
          .eq('coach_id', client.coach_id)
          .not('stripe_customer_id', 'is', null)
          .limit(1)
          .single();

        if (!sub?.stripe_customer_id) {
          return {
            statusCode: 400, headers: corsHeaders,
            body: JSON.stringify({ error: 'No billing account found' })
          };
        }

        const baseUrl = process.env.URL || 'https://ziquecoach.com';

        const session = await stripe.billingPortal.sessions.create(
          {
            customer: sub.stripe_customer_id,
            return_url: `${baseUrl}/`
          },
          { stripeAccount }
        );

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ url: session.url })
        };
      }

      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid action. Use: cancel, reactivate, pause, resume, portal' })
      };
    }

    return {
      statusCode: 405, headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Client subscription manage error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
