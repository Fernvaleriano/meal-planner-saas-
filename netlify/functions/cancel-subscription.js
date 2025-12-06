/**
 * Cancel Subscription Function
 *
 * Cancels a coach's subscription at the end of the billing period.
 * Works for both trial and active subscriptions.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
    // Handle CORS preflight
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
        // Get authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // Initialize Supabase with service key
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Verify the user's token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid token' })
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

        if (!coach.stripe_subscription_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No active subscription found' })
            };
        }

        // First, retrieve the subscription to check its current status
        let subscription;
        try {
            subscription = await stripe.subscriptions.retrieve(coach.stripe_subscription_id);
        } catch (stripeError) {
            // Subscription doesn't exist in Stripe
            if (stripeError.code === 'resource_missing') {
                // Update database to reflect canceled status
                await supabase
                    .from('coaches')
                    .update({
                        subscription_status: 'canceled',
                        canceled_at: new Date().toISOString()
                    })
                    .eq('id', coach.id);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Subscription is already canceled',
                        alreadyCanceled: true
                    })
                };
            }
            throw stripeError;
        }

        // Check if subscription is already canceled or canceling
        if (subscription.status === 'canceled') {
            // Update database to reflect canceled status
            await supabase
                .from('coaches')
                .update({
                    subscription_status: 'canceled',
                    canceled_at: coach.canceled_at || new Date().toISOString()
                })
                .eq('id', coach.id);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Subscription is already canceled',
                    alreadyCanceled: true
                })
            };
        }

        // If already set to cancel at period end
        if (subscription.cancel_at_period_end) {
            const cancelDate = new Date(subscription.current_period_end * 1000);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Subscription is already set to cancel',
                    cancelAt: cancelDate.toISOString(),
                    accessUntil: cancelDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    alreadyCanceling: true
                })
            };
        }

        // Cancel subscription at period end (they keep access until then)
        const updatedSubscription = await stripe.subscriptions.update(
            coach.stripe_subscription_id,
            { cancel_at_period_end: true }
        );

        const cancelDate = new Date(updatedSubscription.current_period_end * 1000);

        // Update coach record
        await supabase
            .from('coaches')
            .update({
                subscription_status: 'canceling',
                canceled_at: new Date().toISOString(),
                cancel_at: cancelDate.toISOString()
            })
            .eq('id', coach.id);

        // Update subscriptions table
        await supabase
            .from('subscriptions')
            .update({
                status: 'canceling',
                cancel_at: cancelDate.toISOString()
            })
            .eq('coach_id', coach.id);

        // Send cancellation confirmation email
        try {
            const { sendCancellationEmail, sendCancellationNotification } = require('./utils/email-service');
            await sendCancellationEmail({
                coach,
                cancelDate
            });
            // Notify admin
            await sendCancellationNotification({
                coach,
                plan: coach.subscription_tier
            });
        } catch (emailError) {
            console.error('Failed to send cancellation email:', emailError);
            // Don't fail the request if email fails
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Subscription will be canceled at the end of your billing period',
                cancelAt: cancelDate.toISOString(),
                accessUntil: cancelDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            })
        };

    } catch (error) {
        console.error('Cancel subscription error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Failed to cancel subscription' })
        };
    }
};
