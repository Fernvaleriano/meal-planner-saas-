const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Price IDs from Stripe Dashboard
const PRICE_IDS = {
    starter: process.env.STRIPE_PRICE_STARTER || 'price_starter_monthly',
    growth: process.env.STRIPE_PRICE_GROWTH || 'price_growth_monthly',
    // Scale ($179) — new tier (May 2026). Real live price ID is the
    // fallback so it works without an extra Netlify env var; set
    // STRIPE_PRICE_SCALE to override.
    scale: process.env.STRIPE_PRICE_SCALE || 'price_1TYPvZGpZpurD75IWAhjVNVH',
    professional: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional_monthly',
    // Legacy support for existing subscribers
    basic: process.env.STRIPE_PRICE_BASIC || process.env.STRIPE_PRICE_STARTER || 'price_starter_monthly',
    branded: process.env.STRIPE_PRICE_BRANDED || process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional_monthly'
};

exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { plan } = body;
        let { email, name } = body;

        // Check for Authorization header (logged-in user)
        const authHeader = event.headers.authorization || event.headers.Authorization;
        let isExistingUser = false;
        let existingCustomerId = null;
        let coachId = null;

        let existingSubscriptionId = null;
        let existingSubscriptionStatus = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (!authError && user) {
                // Get coach data
                const { data: coach } = await supabase
                    .from('coaches')
                    .select('id, email, name, stripe_customer_id, stripe_subscription_id, subscription_status')
                    .eq('id', user.id)
                    .single();

                if (coach) {
                    email = coach.email;
                    name = coach.name || email;
                    coachId = coach.id;
                    existingCustomerId = coach.stripe_customer_id;
                    existingSubscriptionId = coach.stripe_subscription_id;
                    existingSubscriptionStatus = coach.subscription_status;
                    // If coach record exists and user is logged in, they're an existing user - no trial
                    // This covers: has stripe_customer_id, has any subscription_status (including canceled),
                    // or simply has an existing account
                    isExistingUser = true;
                }
            }
        }

        if (!email || !plan) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Email and plan are required' })
            };
        }

        const priceId = PRICE_IDS[plan];
        if (!priceId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid plan selected' })
            };
        }

        // Get the base URL for redirects
        const baseUrl = process.env.URL || 'https://ziquecoach.com';

        // If the coach already has a billable subscription, swap the price on
        // the existing one instead of creating a second subscription (which
        // would double-bill). The customer.subscription.updated webhook will
        // sync subscription_tier and current_period_end into the DB.
        const updatableStatuses = new Set(['active', 'trialing', 'past_due', 'canceling']);
        if (coachId && existingSubscriptionId && updatableStatuses.has(existingSubscriptionStatus)) {
            try {
                const existingSubscription = await stripe.subscriptions.retrieve(existingSubscriptionId);

                if (existingSubscription.status !== 'canceled' && existingSubscription.items?.data?.length) {
                    const currentItem = existingSubscription.items.data[0];

                    // Same plan — no Stripe call, just bounce them back.
                    if (currentItem.price?.id === priceId) {
                        return {
                            statusCode: 200,
                            headers,
                            body: JSON.stringify({
                                url: `${baseUrl}/dashboard.html?plan_unchanged=true`,
                                updated: false,
                                samePlan: true
                            })
                        };
                    }

                    await stripe.subscriptions.update(existingSubscriptionId, {
                        items: [{ id: currentItem.id, price: priceId }],
                        proration_behavior: 'create_prorations',
                        metadata: { plan, coach_id: coachId }
                    });

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            url: `${baseUrl}/dashboard.html?plan_updated=true`,
                            updated: true
                        })
                    };
                }
            } catch (stripeErr) {
                // Subscription deleted upstream — fall through to new checkout.
                if (stripeErr.code !== 'resource_missing') {
                    throw stripeErr;
                }
            }
        }

        // Build checkout session options
        const sessionOptions = {
            payment_method_types: ['card'],
            mode: 'subscription',
            metadata: {
                coach_name: name || '',
                coach_id: coachId || '',
                plan: plan
            },
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            subscription_data: {
                metadata: {
                    coach_email: email,
                    coach_id: coachId || '',
                    plan: plan
                }
            },
            success_url: `${baseUrl}/dashboard.html?subscribed=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/pricing.html?canceled=true`,
            allow_promotion_codes: true
        };

        // Use existing Stripe customer if available, otherwise use email
        if (existingCustomerId) {
            sessionOptions.customer = existingCustomerId;
        } else {
            sessionOptions.customer_email = email;
        }

        // Only give trial to new users (but redirect based on whether they're logged in)
        if (!isExistingUser) {
            sessionOptions.subscription_data.trial_period_days = 14;
        }

        // If user is logged in, always go to dashboard. Only new signups go to signup-success
        if (!coachId) {
            // Not logged in - this is a brand new signup, they need email confirmation
            sessionOptions.success_url = `${baseUrl}/signup-success.html?session_id={CHECKOUT_SESSION_ID}`;
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create(sessionOptions);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                sessionId: session.id,
                url: session.url
            })
        };

    } catch (error) {
        console.error('Stripe checkout error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
