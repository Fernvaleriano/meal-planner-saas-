/**
 * Reactivate Subscription Function
 *
 * Handles two scenarios:
 * 1. Subscription is "canceling" (scheduled to cancel) - removes the cancel_at_period_end flag
 * 2. Subscription is "canceled" (fully ended) - creates a new checkout session
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

// Price IDs for each tier (set these in Netlify environment variables)
const PRICE_IDS = {
    starter: process.env.STRIPE_PRICE_STARTER,
    basic: process.env.STRIPE_PRICE_STARTER,  // alias for starter
    growth: process.env.STRIPE_PRICE_GROWTH,
    professional: process.env.STRIPE_PRICE_PROFESSIONAL,
    branded: process.env.STRIPE_PRICE_PROFESSIONAL  // alias for professional
};

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Get Authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Authorization required' })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify the user with Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }

        // Get coach data
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('*')
            .eq('id', user.id)
            .single();

        if (coachError || !coach) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        // Parse request body for optional tier override
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch (e) {}
        }

        const tier = body.tier || coach.subscription_tier || 'starter';
        const priceId = PRICE_IDS[tier];

        // Scenario 1: Subscription is "canceling" - just remove the cancel flag
        if (coach.subscription_status === 'canceling' && coach.stripe_subscription_id) {
            try {
                // Check if subscription still exists and is actually canceling
                const subscription = await stripe.subscriptions.retrieve(coach.stripe_subscription_id);

                if (subscription.cancel_at_period_end) {
                    // Remove the cancellation
                    const updatedSubscription = await stripe.subscriptions.update(
                        coach.stripe_subscription_id,
                        { cancel_at_period_end: false }
                    );

                    // Update coach record
                    await supabase
                        .from('coaches')
                        .update({
                            subscription_status: 'active',
                            canceled_at: null,
                            cancel_at: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', user.id);

                    // Update subscription record if exists
                    await supabase
                        .from('subscriptions')
                        .update({
                            status: 'active',
                            cancel_at: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('coach_id', user.id);

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            message: 'Subscription reactivated successfully',
                            status: 'active',
                            reactivated: true
                        })
                    };
                }
            } catch (stripeError) {
                console.log('Could not reactivate existing subscription:', stripeError.message);
                // Fall through to create new subscription
            }
        }

        // Scenario 2: Subscription is canceled or doesn't exist - create new checkout session
        if (!priceId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Price ID not configured for tier: ' + tier,
                    redirect: '/pricing.html'
                })
            };
        }

        // Ensure customer exists in Stripe
        let customerId = coach.stripe_customer_id;

        if (!customerId) {
            // Create Stripe customer
            const customer = await stripe.customers.create({
                email: coach.email,
                name: coach.name || coach.email,
                metadata: {
                    coach_id: user.id
                }
            });
            customerId = customer.id;

            // Save customer ID
            await supabase
                .from('coaches')
                .update({ stripe_customer_id: customerId })
                .eq('id', user.id);
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            success_url: `${process.env.URL || 'https://ziquefitnessnutrition.com'}/dashboard.html?reactivated=true`,
            cancel_url: `${process.env.URL || 'https://ziquefitnessnutrition.com'}/billing.html`,
            subscription_data: {
                metadata: {
                    coach_id: user.id,
                    tier: tier
                }
            },
            allow_promotion_codes: true
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                checkoutUrl: session.url,
                sessionId: session.id
            })
        };

    } catch (error) {
        console.error('Reactivation error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
