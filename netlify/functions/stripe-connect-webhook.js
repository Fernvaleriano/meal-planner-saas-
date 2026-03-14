/**
 * Stripe Connect Webhook Handler
 *
 * Handles webhook events from Stripe Connect (events on connected accounts).
 * Uses a separate webhook endpoint with its own signing secret.
 *
 * Events handled:
 * - checkout.session.completed: Client completed payment
 * - invoice.paid: Recurring payment succeeded
 * - invoice.payment_failed: Payment failed
 * - customer.subscription.updated: Plan changed, status changed
 * - customer.subscription.deleted: Subscription canceled
 * - account.updated: Connect account status changed
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_CONNECT_WEBHOOK_SECRET not configured');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Connect webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Connect webhook events have an 'account' field indicating the connected account
  const connectedAccountId = stripeEvent.account;

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(stripeEvent.data.object, connectedAccountId);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(stripeEvent.data.object, connectedAccountId);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object, connectedAccountId);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object, connectedAccountId);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object, connectedAccountId);
        break;

      case 'account.updated':
        await handleAccountUpdated(stripeEvent.data.object);
        break;

      default:
        break;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (error) {
    console.error('Connect webhook handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Find coach by their connected account ID
async function findCoachByConnectId(connectAccountId) {
  const { data } = await supabase
    .from('coaches')
    .select('id')
    .eq('stripe_connect_account_id', connectAccountId)
    .single();
  return data;
}

async function handleCheckoutComplete(session, connectedAccountId) {
  const clientId = session.metadata?.client_id;
  const coachId = session.metadata?.coach_id;
  const planId = session.metadata?.plan_id;

  if (!clientId || !coachId || !planId) {
    console.error('Missing metadata in checkout session:', session.id);
    return;
  }

  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const mode = session.mode;

  if (mode === 'subscription' && subscriptionId) {
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { stripeAccount: connectedAccountId }
    );

    const status = subscription.status;
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    // Upsert client subscription
    await supabase
      .from('client_subscriptions')
      .upsert({
        client_id: clientId,
        coach_id: coachId,
        plan_id: planId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        status: status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        trial_ends_at: trialEnd,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'client_id,coach_id',
        ignoreDuplicates: false
      });

  } else if (mode === 'payment') {
    // One-time payment
    const paymentIntentId = session.payment_intent;
    const amountTotal = session.amount_total;

    await supabase
      .from('client_payments')
      .insert({
        client_id: clientId,
        coach_id: coachId,
        plan_id: planId,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: amountTotal,
        currency: session.currency || 'usd',
        status: 'succeeded',
        description: `One-time payment for plan`
      });
  }
}

async function handleInvoicePaid(invoice, connectedAccountId) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  // Find the client subscription
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id, client_id, coach_id, plan_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!sub) return;

  // Update subscription status
  await supabase
    .from('client_subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);

  // Record payment
  await supabase
    .from('client_payments')
    .insert({
      client_id: sub.client_id,
      coach_id: sub.coach_id,
      plan_id: sub.plan_id,
      subscription_id: sub.id,
      stripe_invoice_id: invoice.id,
      stripe_charge_id: invoice.charge,
      amount_cents: invoice.amount_paid,
      currency: invoice.currency || 'usd',
      status: 'succeeded',
      description: `Recurring payment`
    });
}

async function handlePaymentFailed(invoice, connectedAccountId) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id, client_id, coach_id, plan_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!sub) return;

  await supabase
    .from('client_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);

  // Record failed payment
  await supabase
    .from('client_payments')
    .insert({
      client_id: sub.client_id,
      coach_id: sub.coach_id,
      plan_id: sub.plan_id,
      subscription_id: sub.id,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_due,
      currency: invoice.currency || 'usd',
      status: 'failed',
      description: 'Payment failed'
    });
}

async function handleSubscriptionUpdated(subscription, connectedAccountId) {
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!sub) return;

  const updateData = {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  if (subscription.cancel_at_period_end) {
    updateData.status = 'canceling';
    updateData.cancel_at = new Date(subscription.current_period_end * 1000).toISOString();
  }

  if (subscription.canceled_at) {
    updateData.canceled_at = new Date(subscription.canceled_at * 1000).toISOString();
  }

  await supabase
    .from('client_subscriptions')
    .update(updateData)
    .eq('id', sub.id);
}

async function handleSubscriptionDeleted(subscription, connectedAccountId) {
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!sub) return;

  await supabase
    .from('client_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);
}

async function handleAccountUpdated(account) {
  // Update coach's Connect status when their account changes
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('stripe_connect_account_id', account.id)
    .single();

  if (!coach) return;

  await supabase
    .from('coaches')
    .update({
      stripe_connect_onboarding_complete: account.details_submitted,
      stripe_connect_charges_enabled: account.charges_enabled,
      stripe_connect_payouts_enabled: account.payouts_enabled,
      updated_at: new Date().toISOString()
    })
    .eq('id', coach.id);
}
