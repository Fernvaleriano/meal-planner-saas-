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

  // Connect webhook events have an 'account' field indicating the connected
  // account. Platform-scoped events (e.g. coach signups on the main account)
  // can also be delivered here if the endpoint is subscribed to the same event
  // types; those must be ignored so they don't race the platform handler for
  // the shared idempotency row and silently swallow the event.
  const connectedAccountId = stripeEvent.account;
  if (!connectedAccountId) {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: 'platform-scoped event' })
    };
  }

  // Idempotency: insert the event ID. Unique violation = duplicate redelivery → 200.
  const { error: dedupeErr } = await supabase
    .from('processed_webhook_events')
    .insert({
      stripe_event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      source: 'connect'
    });

  if (dedupeErr) {
    if (dedupeErr.code === '23505') {
      // Already processed — return 200 so Stripe stops retrying.
      return {
        statusCode: 200,
        body: JSON.stringify({ received: true, duplicate: true })
      };
    }
    // DB unreachable — fail closed so Stripe retries.
    console.error('Idempotency insert failed:', dedupeErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'idempotency check failed' })
    };
  }

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
    // Roll back the idempotency record so Stripe's retry will be processed.
    await supabase
      .from('processed_webhook_events')
      .delete()
      .eq('stripe_event_id', stripeEvent.id);
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

// Fire-and-forget billing notification to the coach's bell icon.
// Wrapped in try/catch so a notification failure never causes the
// webhook to 500 — the actual billing write is what matters.
async function notifyCoach({ coachId, clientId, type, title, message }) {
  try {
    await supabase.from('notifications').insert([{
      user_id: coachId,
      type,
      title,
      message,
      related_client_id: clientId
    }]);
  } catch (err) {
    console.error('Failed to insert coach notification:', err);
  }
}

async function lookupClientAndPlanNames(clientId, planId) {
  const [{ data: client }, { data: plan }] = await Promise.all([
    supabase.from('clients').select('client_name').eq('id', clientId).maybeSingle(),
    planId
      ? supabase.from('coach_payment_plans').select('name').eq('id', planId).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  return {
    clientName: client?.client_name || 'A client',
    planName: plan?.name || 'a plan'
  };
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
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { stripeAccount: connectedAccountId }
    );

    const { error } = await supabase
      .from('client_subscriptions')
      .upsert({
        client_id: clientId,
        coach_id: coachId,
        plan_id: planId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'client_id,coach_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Failed to upsert client_subscription:', error);
      throw error;
    }

    const { clientName, planName } = await lookupClientAndPlanNames(clientId, planId);
    await notifyCoach({
      coachId,
      clientId,
      type: 'client_subscribed',
      title: `${clientName} subscribed`,
      message: `Started ${planName}`
    });

  } else if (mode === 'payment') {
    const { error } = await supabase
      .from('client_payments')
      .insert({
        client_id: clientId,
        coach_id: coachId,
        plan_id: planId,
        stripe_payment_intent_id: session.payment_intent,
        amount_cents: session.amount_total,
        currency: session.currency || 'usd',
        status: 'succeeded',
        description: 'One-time payment for plan'
      });

    if (error) {
      console.error('Failed to insert client_payment (one-time):', error);
      throw error;
    }

    const { clientName, planName } = await lookupClientAndPlanNames(clientId, planId);
    const amount = ((session.amount_total || 0) / 100).toFixed(2);
    await notifyCoach({
      coachId,
      clientId,
      type: 'client_payment',
      title: `${clientName} paid $${amount}`,
      message: `One-time payment for ${planName}`
    });
  }
}

// Look up the client_subscriptions row by Stripe subscription ID. If it does
// not yet exist (out-of-order webhook delivery — invoice.paid can race ahead
// of checkout.session.completed), retrieve the subscription from Stripe and
// upsert the row from its metadata so the caller can proceed.
async function findOrBackfillSubscriptionRow(subscriptionId, connectedAccountId) {
  const { data: existing } = await supabase
    .from('client_subscriptions')
    .select('id, client_id, coach_id, plan_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();
  if (existing) return existing;

  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { stripeAccount: connectedAccountId }
    );
  } catch (err) {
    console.error('Failed to retrieve Stripe subscription', subscriptionId, err);
    return null;
  }

  const meta = subscription.metadata || {};
  if (!meta.client_id || !meta.coach_id || !meta.plan_id) {
    console.error('Cannot backfill subscription — metadata missing on', subscriptionId);
    return null;
  }

  const { data: created, error } = await supabase
    .from('client_subscriptions')
    .upsert({
      client_id: meta.client_id,
      coach_id: meta.coach_id,
      plan_id: meta.plan_id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: subscription.customer,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'client_id,coach_id',
      ignoreDuplicates: false
    })
    .select('id, client_id, coach_id, plan_id')
    .single();

  if (error) {
    console.error('Failed to backfill client_subscription:', error);
    return null;
  }
  return created;
}

async function handleInvoicePaid(invoice, connectedAccountId) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const sub = await findOrBackfillSubscriptionRow(subscriptionId, connectedAccountId);
  if (!sub) return;

  const { error: updateErr } = await supabase
    .from('client_subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);
  if (updateErr) {
    console.error('Failed to update client_subscription status:', updateErr);
    throw updateErr;
  }

  const { error: insertErr } = await supabase
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
      description: 'Recurring payment'
    });
  if (insertErr) {
    console.error('Failed to insert client_payment for invoice', invoice.id, insertErr);
    throw insertErr;
  }
}

async function handlePaymentFailed(invoice, connectedAccountId) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const sub = await findOrBackfillSubscriptionRow(subscriptionId, connectedAccountId);
  if (!sub) return;

  const { error: updateErr } = await supabase
    .from('client_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);
  if (updateErr) {
    console.error('Failed to mark subscription past_due:', updateErr);
    throw updateErr;
  }

  const { error: insertErr } = await supabase
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
  if (insertErr) {
    console.error('Failed to record failed payment for invoice', invoice.id, insertErr);
    throw insertErr;
  }

  const { clientName } = await lookupClientAndPlanNames(sub.client_id, sub.plan_id);
  const amount = ((invoice.amount_due || 0) / 100).toFixed(2);
  await notifyCoach({
    coachId: sub.coach_id,
    clientId: sub.client_id,
    type: 'client_payment_failed',
    title: `${clientName}'s payment failed`,
    message: `$${amount} could not be charged`
  });
}

async function handleSubscriptionUpdated(subscription, connectedAccountId) {
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id, plan_id, pending_plan_id, stripe_schedule_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!sub) return;

  const updateData = {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  // Stripe leaves subscription.status='active' when collection is paused,
  // but we surface a distinct 'paused' status in our UI. Preserve it so
  // subsequent update events don't silently flip the row back to 'active'.
  if (subscription.pause_collection) {
    updateData.status = 'paused';
  }

  if (subscription.cancel_at_period_end) {
    updateData.status = 'canceling';
    updateData.cancel_at = new Date(subscription.current_period_end * 1000).toISOString();
  }

  if (subscription.canceled_at) {
    updateData.canceled_at = new Date(subscription.canceled_at * 1000).toISOString();
  }

  // Scheduled plan change fired: when a Subscription Schedule transitions
  // to its next phase, Stripe swaps the subscription's price and emits
  // customer.subscription.updated. If we have a pending plan whose
  // stripe_price_id now matches the subscription's current price, promote
  // pending_plan_id → plan_id and clear the pending fields.
  if (sub.pending_plan_id) {
    const currentPriceId = subscription.items?.data?.[0]?.price?.id
      || subscription.items?.data?.[0]?.price;
    if (currentPriceId) {
      const { data: pendingPlan } = await supabase
        .from('coach_payment_plans')
        .select('id, stripe_price_id')
        .eq('id', sub.pending_plan_id)
        .single();
      if (pendingPlan && pendingPlan.stripe_price_id === currentPriceId) {
        updateData.plan_id = sub.pending_plan_id;
        updateData.pending_plan_id = null;
        updateData.pending_change_effective_at = null;
        updateData.stripe_schedule_id = null;
      }
    }
  }

  const { error } = await supabase
    .from('client_subscriptions')
    .update(updateData)
    .eq('id', sub.id);
  if (error) {
    console.error('Failed to update client_subscription on update event:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription, connectedAccountId) {
  const { data: sub } = await supabase
    .from('client_subscriptions')
    .select('id, client_id, coach_id, plan_id')
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

  const { clientName } = await lookupClientAndPlanNames(sub.client_id, sub.plan_id);
  await notifyCoach({
    coachId: sub.coach_id,
    clientId: sub.client_id,
    type: 'client_canceled',
    title: `${clientName} canceled`,
    message: 'Subscription has ended'
  });
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
