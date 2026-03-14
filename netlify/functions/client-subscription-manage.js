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

      // Get active subscription
      const { data: subscription } = await supabase
        .from('client_subscriptions')
        .select('*, coach_payment_plans(*)')
        .eq('client_id', client.id)
        .eq('coach_id', client.coach_id)
        .in('status', ['active', 'trialing', 'past_due', 'canceling'])
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

        // Cancel at period end
        const updated = await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { cancel_at_period_end: true },
          { stripeAccount }
        );

        const cancelDate = new Date(updated.current_period_end * 1000);

        await supabase
          .from('client_subscriptions')
          .update({
            status: 'canceling',
            cancel_at: cancelDate.toISOString(),
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            cancelAt: cancelDate.toISOString(),
            message: 'Subscription will cancel at end of billing period'
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

        const baseUrl = process.env.URL || 'https://ziquefitnessnutrition.com';

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
        body: JSON.stringify({ error: 'Invalid action. Use: cancel, portal' })
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
