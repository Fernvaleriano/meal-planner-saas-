/**
 * Client Checkout
 *
 * Creates a Stripe Checkout Session on the coach's connected account
 * for a client to subscribe to or purchase a plan.
 *
 * Also handles upgrade/downgrade between tier plans.
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    const { planId, promoCode, action } = JSON.parse(event.body || '{}');

    if (!planId) {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'planId is required' })
      };
    }

    // Get the plan
    const { data: plan, error: planErr } = await supabase
      .from('coach_payment_plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (planErr || !plan) {
      return {
        statusCode: 404, headers: corsHeaders,
        body: JSON.stringify({ error: 'Plan not found or inactive' })
      };
    }

    // Get coach's connected account
    const { data: coach } = await supabase
      .from('coaches')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', plan.coach_id)
      .single();

    if (!coach?.stripe_connect_account_id || !coach.stripe_connect_charges_enabled) {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach payment system is not ready' })
      };
    }

    const stripeAccount = coach.stripe_connect_account_id;

    // Get client info
    const { data: client } = await supabase
      .from('clients')
      .select('id, email, client_name, coach_id')
      .eq('user_id', user.id)
      .eq('coach_id', plan.coach_id)
      .single();

    if (!client) {
      return {
        statusCode: 403, headers: corsHeaders,
        body: JSON.stringify({ error: 'You are not a client of this coach' })
      };
    }

    const baseUrl = process.env.URL || 'https://ziquefitnessnutrition.com';

    // Check for existing subscription (upgrade/downgrade)
    if (action === 'change_plan') {
      const { data: existingSub } = await supabase
        .from('client_subscriptions')
        .select('*')
        .eq('client_id', client.id)
        .eq('coach_id', plan.coach_id)
        .in('status', ['active', 'trialing'])
        .single();

      if (existingSub?.stripe_subscription_id) {
        // Retrieve the existing subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(
          existingSub.stripe_subscription_id,
          { stripeAccount }
        );

        // Update the subscription to the new plan
        const updatedSub = await stripe.subscriptions.update(
          existingSub.stripe_subscription_id,
          {
            items: [{
              id: subscription.items.data[0].id,
              price: plan.stripe_price_id
            }],
            proration_behavior: 'create_prorations'
          },
          { stripeAccount }
        );

        // Update in DB
        await supabase
          .from('client_subscriptions')
          .update({
            plan_id: plan.id,
            status: updatedSub.status,
            current_period_end: new Date(updatedSub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSub.id);

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Plan changed successfully',
            subscription: {
              id: existingSub.id,
              plan_id: plan.id,
              status: updatedSub.status
            }
          })
        };
      }
    }

    // Create or find Stripe customer on the connected account
    let stripeCustomerId;

    // Check if client already has a customer ID for this coach
    const { data: existingCustomerSub } = await supabase
      .from('client_subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', client.id)
      .eq('coach_id', plan.coach_id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .single();

    if (existingCustomerSub?.stripe_customer_id) {
      stripeCustomerId = existingCustomerSub.stripe_customer_id;
    } else {
      // Create customer on the connected account
      const customer = await stripe.customers.create(
        {
          email: client.email,
          name: client.client_name,
          metadata: {
            client_id: client.id,
            coach_id: plan.coach_id
          }
        },
        { stripeAccount }
      );
      stripeCustomerId = customer.id;
    }

    // Build checkout session
    const isSubscription = plan.type === 'subscription' || plan.type === 'tier';
    const lineItems = [{ price: plan.stripe_price_id, quantity: 1 }];

    // Add setup fee as a separate line item
    if (isSubscription && plan.stripe_setup_price_id && plan.setup_fee_cents > 0) {
      lineItems.push({ price: plan.stripe_setup_price_id, quantity: 1 });
    }

    const sessionParams = {
      customer: stripeCustomerId,
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: lineItems,
      success_url: `${baseUrl}/?billing_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?billing_canceled=true`,
      metadata: {
        client_id: client.id,
        coach_id: plan.coach_id,
        plan_id: plan.id
      }
    };

    // Add trial period for subscriptions
    if (isSubscription && plan.trial_days > 0) {
      sessionParams.subscription_data = {
        trial_period_days: plan.trial_days,
        metadata: {
          client_id: client.id,
          coach_id: plan.coach_id,
          plan_id: plan.id
        }
      };
    } else if (isSubscription) {
      sessionParams.subscription_data = {
        metadata: {
          client_id: client.id,
          coach_id: plan.coach_id,
          plan_id: plan.id
        }
      };
    }

    // Apply promo code if provided
    if (promoCode) {
      const { data: promo } = await supabase
        .from('coach_promo_codes')
        .select('*')
        .eq('coach_id', plan.coach_id)
        .eq('code', promoCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (promo) {
        // Check restrictions
        const isValid = (!promo.expires_at || new Date(promo.expires_at) > new Date()) &&
                        (!promo.max_uses || promo.times_used < promo.max_uses) &&
                        (promo.plan_ids.length === 0 || promo.plan_ids.includes(plan.id));

        if (isValid && promo.stripe_promo_code_id) {
          sessionParams.discounts = [{ promotion_code: promo.stripe_promo_code_id }];
        }
      }
    }

    // Use idempotency key
    const idempotencyKey = `checkout_${client.id}_${plan.id}_${Date.now()}`;

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      {
        stripeAccount,
        idempotencyKey
      }
    );

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url
      })
    };

  } catch (error) {
    console.error('Client checkout error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
