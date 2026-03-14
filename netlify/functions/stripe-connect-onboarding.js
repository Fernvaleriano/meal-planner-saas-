/**
 * Stripe Connect Onboarding
 *
 * Handles creating a Stripe Connect Express account for a coach
 * and generating the onboarding link.
 *
 * Actions:
 * - create: Create a new Connect account and return onboarding link
 * - status: Check onboarding status
 * - dashboard: Generate a Stripe Express dashboard login link
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

    const { action } = JSON.parse(event.body || '{}');
    const baseUrl = process.env.URL || 'https://ziquefitnessnutrition.com';

    // Get coach record
    const { data: coach, error: coachErr } = await supabase
      .from('coaches')
      .select('id, email, name, stripe_connect_account_id, stripe_connect_onboarding_complete, stripe_connect_charges_enabled')
      .eq('id', user.id)
      .single();

    if (coachErr || !coach) {
      return {
        statusCode: 404, headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach not found' })
      };
    }

    if (action === 'create') {
      let accountId = coach.stripe_connect_account_id;

      if (!accountId) {
        // Create a new Express connected account
        const account = await stripe.accounts.create({
          type: 'express',
          email: coach.email,
          metadata: { coach_id: coach.id },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
          },
          business_profile: {
            name: coach.name || undefined,
            product_description: 'Fitness coaching and meal planning services'
          }
        });

        accountId = account.id;

        await supabase
          .from('coaches')
          .update({
            stripe_connect_account_id: accountId,
            updated_at: new Date().toISOString()
          })
          .eq('id', coach.id);
      }

      // Create an account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/billing`,
        return_url: `${baseUrl}/billing?connect_complete=true`,
        type: 'account_onboarding'
      });

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({
          url: accountLink.url,
          accountId
        })
      };
    }

    if (action === 'status') {
      if (!coach.stripe_connect_account_id) {
        return {
          statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({
            connected: false,
            onboarding_complete: false,
            charges_enabled: false,
            payouts_enabled: false
          })
        };
      }

      // Fetch account status from Stripe
      const account = await stripe.accounts.retrieve(coach.stripe_connect_account_id);

      // Update local DB with latest status
      const isComplete = account.details_submitted;
      const chargesEnabled = account.charges_enabled;
      const payoutsEnabled = account.payouts_enabled;

      await supabase
        .from('coaches')
        .update({
          stripe_connect_onboarding_complete: isComplete,
          stripe_connect_charges_enabled: chargesEnabled,
          stripe_connect_payouts_enabled: payoutsEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', coach.id);

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({
          connected: true,
          onboarding_complete: isComplete,
          charges_enabled: chargesEnabled,
          payouts_enabled: payoutsEnabled,
          account_id: coach.stripe_connect_account_id
        })
      };
    }

    if (action === 'dashboard') {
      if (!coach.stripe_connect_account_id) {
        return {
          statusCode: 400, headers: corsHeaders,
          body: JSON.stringify({ error: 'No connected Stripe account' })
        };
      }

      const loginLink = await stripe.accounts.createLoginLink(
        coach.stripe_connect_account_id
      );

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ url: loginLink.url })
      };
    }

    return {
      statusCode: 400, headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid action. Use: create, status, dashboard' })
    };

  } catch (error) {
    console.error('Stripe Connect onboarding error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
