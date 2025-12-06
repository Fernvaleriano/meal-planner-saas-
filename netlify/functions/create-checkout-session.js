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

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (!authError && user) {
                // Get coach data
                const { data: coach } = await supabase
                    .from('coaches')
                    .select('id, email, name, stripe_customer_id, subscription_status')
                    .eq('id', user.id)
                    .single();

                if (coach) {
                    email = coach.email;
                    name = coach.name || email;
                    coachId = coach.id;
                    existingCustomerId = coach.stripe_customer_id;
                    // If coach record exists and user is logged in, they're an existing user - no trial
                    // This covers: has stripe_customer_id, has any subscription_status (including canceled),
                    // or simply has an existing account
                    isExistingUser = true;
                    console.log('Existing user detected:', { coachId, existingCustomerId, status: coach.subscription_status });
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
        const baseUrl = process.env.URL || 'https://ziquefitnessnutrition.com';

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
