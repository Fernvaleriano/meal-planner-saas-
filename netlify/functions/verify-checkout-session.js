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
        // Check for Authorization header (require logged-in user)
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Authorization required' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid token' })
            };
        }

        const body = JSON.parse(event.body || '{}');
        const { sessionId } = body;

        if (!sessionId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Session ID is required' })
            };
        }

        // Retrieve the checkout session from Stripe
        console.log('Retrieving checkout session:', sessionId);
        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['subscription']
            });
        } catch (stripeError) {
            console.error('Stripe session retrieval error:', stripeError.message);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid or expired session ID' })
            };
        }

        if (!session) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Session not found' })
            };
        }

        console.log('Session retrieved:', { status: session.status, customer: session.customer });

        // Verify the session belongs to this user
        const coachIdFromSession = session.metadata?.coach_id;
        const customerEmail = session.customer_email || session.customer_details?.email;

        // Get coach record
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('id, email, subscription_status, subscription_tier')
            .eq('id', user.id)
            .single();

        if (coachError || !coach) {
            console.error('Coach lookup error:', coachError);
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        console.log('Coach found:', { id: coach.id, email: coach.email });

        // Verify the session matches the coach (by ID or email)
        // Only check if coachIdFromSession is a non-empty string
        const coachIdMatches = !coachIdFromSession || coachIdFromSession === '' || coachIdFromSession === coach.id;
        const emailMatches = customerEmail && customerEmail.toLowerCase() === coach.email.toLowerCase();

        if (!coachIdMatches && !emailMatches) {
            console.log('Session verification failed:', { coachIdFromSession, customerEmail, coachId: coach.id, coachEmail: coach.email });
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: 'Session does not match this account' })
            };
        }

        // Check if the session is completed
        if (session.status !== 'complete') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    subscription_status: coach.subscription_status,
                    subscription_tier: coach.subscription_tier,
                    message: 'Checkout session not yet complete'
                })
            };
        }

        // Get subscription details
        const subscription = session.subscription;
        if (!subscription) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    subscription_status: coach.subscription_status,
                    subscription_tier: coach.subscription_tier,
                    message: 'No subscription found in session'
                })
            };
        }

        // Determine the subscription status
        let newStatus = 'active';
        let trialEndsAt = null;

        if (typeof subscription === 'object') {
            // Expanded subscription object
            if (subscription.status === 'trialing') {
                newStatus = 'trialing';
                trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
            } else {
                newStatus = subscription.status;
            }
        } else if (typeof subscription === 'string') {
            // Just subscription ID, need to fetch it
            try {
                const subDetails = await stripe.subscriptions.retrieve(subscription);
                if (subDetails.status === 'trialing') {
                    newStatus = 'trialing';
                    trialEndsAt = new Date(subDetails.trial_end * 1000).toISOString();
                } else {
                    newStatus = subDetails.status;
                }
            } catch (e) {
                console.log('Could not retrieve subscription details:', e.message);
            }
        }

        // Get plan from metadata
        const plan = session.metadata?.plan || 'starter';

        // Update the coach record
        const { error: updateError } = await supabase
            .from('coaches')
            .update({
                stripe_customer_id: session.customer,
                stripe_subscription_id: typeof subscription === 'string' ? subscription : subscription.id,
                subscription_tier: plan,
                subscription_status: newStatus,
                trial_ends_at: trialEndsAt,
                canceled_at: null,
                cancel_at: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', coach.id);

        if (updateError) {
            console.error('Error updating coach:', updateError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to update subscription' })
            };
        }

        // Also update subscriptions table
        await supabase
            .from('subscriptions')
            .upsert({
                coach_id: coach.id,
                tier: plan,
                status: newStatus,
                stripe_subscription_id: typeof subscription === 'string' ? subscription : subscription.id,
                trial_ends_at: trialEndsAt,
                cancel_at: null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'coach_id' });

        console.log('Verified and updated subscription for coach:', coach.email, 'Status:', newStatus);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                subscription_status: newStatus,
                subscription_tier: plan,
                message: 'Subscription verified and updated'
            })
        };

    } catch (error) {
        console.error('Verify checkout session error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
