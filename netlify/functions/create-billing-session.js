const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

exports.handler = async (event) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

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
        const { coachId } = JSON.parse(event.body);

        if (!coachId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Coach ID is required' })
            };
        }

        // Get coach's Stripe customer ID
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('stripe_customer_id, email')
            .eq('id', coachId)
            .single();

        if (coachError || !coach) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        if (!coach.stripe_customer_id) {
            // No Stripe customer yet - redirect to pricing page
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    redirect: true,
                    url: '/pricing.html'
                })
            };
        }

        // Create Stripe billing portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: coach.stripe_customer_id,
            return_url: `${process.env.URL || 'https://ziquefitness.com'}/dashboard.html`
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ url: session.url })
        };

    } catch (error) {
        console.error('Billing session error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
