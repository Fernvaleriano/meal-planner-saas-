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

    const baseUrl = process.env.URL || 'https://ziquecoach.com';

    // Plan change: upgrade applies immediately + bills the prorated
    // difference; downgrade (or same-price swap) is scheduled to take
    // effect at the end of the current billing period so the client
    // keeps the access they already paid for.
    if (action === 'change_plan') {
      const { data: existingSub } = await supabase
        .from('client_subscriptions')
        .select('*')
        .eq('client_id', client.id)
        .eq('coach_id', plan.coach_id)
        .in('status', ['active', 'trialing'])
        .single();

      if (existingSub?.stripe_subscription_id) {
        // Load the current plan's price so we can tell upgrade from downgrade.
        const { data: currentPlan } = await supabase
          .from('coach_payment_plans')
          .select('price_cents, stripe_price_id')
          .eq('id', existingSub.plan_id)
          .single();

        const oldPriceCents = currentPlan?.price_cents ?? 0;
        const newPriceCents = plan.price_cents;
        const isUpgrade = newPriceCents > oldPriceCents;
        const isNoOp = plan.id === existingSub.plan_id;

        if (isNoOp) {
          return {
            statusCode: 200, headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              message: 'Already on this plan',
              subscription: { id: existingSub.id, plan_id: plan.id, status: existingSub.status }
            })
          };
        }

        const subscription = await stripe.subscriptions.retrieve(
          existingSub.stripe_subscription_id,
          { stripeAccount }
        );

        if (isUpgrade) {
          // Cancel any pending schedule so the upgrade applies cleanly.
          if (existingSub.stripe_schedule_id) {
            try {
              await stripe.subscriptionSchedules.release(
                existingSub.stripe_schedule_id,
                {},
                { stripeAccount }
              );
            } catch (err) {
              // Schedule may already be released/canceled — keep going.
              console.warn('Could not release schedule on upgrade:', err.message);
            }
          }

          const updatedSub = await stripe.subscriptions.update(
            existingSub.stripe_subscription_id,
            {
              items: [{
                id: subscription.items.data[0].id,
                price: plan.stripe_price_id
              }],
              proration_behavior: 'always_invoice'
            },
            { stripeAccount }
          );

          const { error: updErr } = await supabase
            .from('client_subscriptions')
            .update({
              plan_id: plan.id,
              status: updatedSub.status,
              current_period_end: new Date(updatedSub.current_period_end * 1000).toISOString(),
              pending_plan_id: null,
              pending_change_effective_at: null,
              stripe_schedule_id: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingSub.id);
          if (updErr) {
            console.error('Failed to update subscription after upgrade:', updErr);
            throw updErr;
          }

          return {
            statusCode: 200, headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              message: 'Plan upgraded',
              subscription: {
                id: existingSub.id,
                plan_id: plan.id,
                status: updatedSub.status,
                pending_plan_id: null,
                pending_change_effective_at: null
              }
            })
          };
        }

        // Downgrade or same-price swap → schedule the change for period end.
        const currentPeriodEnd = subscription.current_period_end;
        const currentPriceId = subscription.items.data[0].price.id || subscription.items.data[0].price;

        let schedule;
        if (existingSub.stripe_schedule_id) {
          // Update existing schedule to target the new (different) plan.
          schedule = await stripe.subscriptionSchedules.update(
            existingSub.stripe_schedule_id,
            {
              phases: [
                {
                  items: [{ price: currentPriceId, quantity: 1 }],
                  start_date: subscription.current_period_start,
                  end_date: currentPeriodEnd
                },
                {
                  items: [{ price: plan.stripe_price_id, quantity: 1 }]
                }
              ],
              end_behavior: 'release'
            },
            { stripeAccount }
          );
        } else {
          // Create a new schedule from the subscription, then append the
          // downgrade phase. Stripe's from_subscription auto-populates
          // phase[0] with the current state — we re-send it explicitly so
          // we can append phase[1] in the same update call.
          const initial = await stripe.subscriptionSchedules.create(
            { from_subscription: existingSub.stripe_subscription_id },
            { stripeAccount }
          );

          schedule = await stripe.subscriptionSchedules.update(
            initial.id,
            {
              phases: [
                {
                  items: initial.phases[0].items.map(item => ({
                    price: item.price,
                    quantity: item.quantity
                  })),
                  start_date: initial.phases[0].start_date,
                  end_date: initial.phases[0].end_date
                },
                {
                  items: [{ price: plan.stripe_price_id, quantity: 1 }]
                }
              ],
              end_behavior: 'release'
            },
            { stripeAccount }
          );
        }

        const { error: pendingErr } = await supabase
          .from('client_subscriptions')
          .update({
            pending_plan_id: plan.id,
            pending_change_effective_at: new Date(currentPeriodEnd * 1000).toISOString(),
            stripe_schedule_id: schedule.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSub.id);
        if (pendingErr) {
          console.error('Failed to record pending plan change:', pendingErr);
          throw pendingErr;
        }

        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: 'Plan change scheduled for end of current billing period',
            subscription: {
              id: existingSub.id,
              plan_id: existingSub.plan_id,
              status: existingSub.status,
              pending_plan_id: plan.id,
              pending_change_effective_at: new Date(currentPeriodEnd * 1000).toISOString()
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
      success_url: `${baseUrl}/my-billing?billing_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/my-billing?billing_canceled=true`,
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
