const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Price IDs from Stripe Dashboard - UPDATE THESE WITH YOUR ACTUAL PRICE IDS
const PRICE_IDS = {
    basic: process.env.STRIPE_PRICE_BASIC || 'price_basic_monthly',
    branded: process.env.STRIPE_PRICE_BRANDED || 'price_branded_monthly'
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
        const { email, plan, name } = JSON.parse(event.body);

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
        const baseUrl = process.env.URL || 'https://your-site.netlify.app';

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer_email: email,
            metadata: {
                coach_name: name || '',
                plan: plan
            },
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            subscription_data: {
                trial_period_days: 14, // 14-day free trial
                metadata: {
                    coach_email: email,
                    plan: plan
                }
            },
            success_url: `${baseUrl}/signup-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/pricing.html?canceled=true`,
            allow_promotion_codes: true
        });

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
