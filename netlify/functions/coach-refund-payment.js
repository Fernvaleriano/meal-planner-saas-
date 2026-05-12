/**
 * Coach Refund Payment
 *
 * Lets a coach refund a recorded payment directly from the app instead
 * of having to log into the Stripe Dashboard. Refunds run on the coach's
 * connected account, so the money comes out of the coach's balance (not
 * the platform's).
 *
 * Full refunds only for now — partial refunds can be a follow-up.
 *
 * The `charge.refunded` webhook event also fires when a refund is issued
 * via the Stripe Dashboard; the stripe-connect-webhook handler keeps the
 * client_payments row in sync either way.
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
    return {
      statusCode: 405, headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    const { paymentId } = JSON.parse(event.body || '{}');
    if (!paymentId) {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'paymentId is required' })
      };
    }

    // Fetch the payment and verify the caller owns the coach side.
    const { data: payment, error: pErr } = await supabase
      .from('client_payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    if (pErr || !payment) {
      return {
        statusCode: 404, headers: corsHeaders,
        body: JSON.stringify({ error: 'Payment not found' })
      };
    }

    if (payment.coach_id !== user.id) {
      return {
        statusCode: 403, headers: corsHeaders,
        body: JSON.stringify({ error: 'Not your payment' })
      };
    }

    if (payment.status === 'refunded') {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'Payment is already refunded' })
      };
    }

    if (payment.status !== 'succeeded') {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'Only succeeded payments can be refunded' })
      };
    }

    // Get coach's connected account
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

    // Prefer charge ID; fall back to payment_intent. One must exist for
    // any payment recorded via the webhook.
    const refundParams = { reason: 'requested_by_customer' };
    if (payment.stripe_charge_id) {
      refundParams.charge = payment.stripe_charge_id;
    } else if (payment.stripe_payment_intent_id) {
      refundParams.payment_intent = payment.stripe_payment_intent_id;
    } else {
      return {
        statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({
          error: 'Payment has no charge or payment_intent on file — refund manually in Stripe Dashboard'
        })
      };
    }

    const refund = await stripe.refunds.create(refundParams, { stripeAccount });

    // Mark the payment as refunded. The charge.refunded webhook will also
    // run this update — that's fine, the values are idempotent.
    const { error: updErr } = await supabase
      .from('client_payments')
      .update({
        status: 'refunded',
        description: payment.description
          ? `${payment.description} (refunded)`
          : 'Refunded'
      })
      .eq('id', payment.id);
    if (updErr) {
      console.error('Failed to mark client_payment refunded:', updErr);
      // Refund went through on Stripe's side; surface success but flag.
    }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        refund_id: refund.id,
        amount_cents: refund.amount,
        message: 'Refund issued'
      })
    };

  } catch (error) {
    console.error('Refund error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
