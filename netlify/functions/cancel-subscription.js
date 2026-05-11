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

        // Check if subscription is in trial period
        const isTrialing = subscription.status === 'trialing';

        let cancelDate;
        let immediatelyCanceled = false;

        if (isTrialing) {
            // Trial users lose access immediately - cancel the subscription now
            await stripe.subscriptions.cancel(coach.stripe_subscription_id);
            cancelDate = new Date();
            immediatelyCanceled = true;

            // Update coach record - immediately canceled
            await supabase
                .from('coaches')
                .update({
                    subscription_status: 'canceled',
                    canceled_at: new Date().toISOString(),
                    cancel_at: null,
                    trial_ends_at: null
                })
                .eq('id', coach.id);

            // Update subscriptions table
            await supabase
                .from('subscriptions')
                .update({
                    status: 'canceled',
                    cancel_at: null
                })
                .eq('coach_id', coach.id);
        } else {
            // Paid users keep access until end of billing period
            const updatedSubscription = await stripe.subscriptions.update(
                coach.stripe_subscription_id,
                { cancel_at_period_end: true }
            );

            cancelDate = new Date(updatedSubscription.current_period_end * 1000);

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
        }

        // Cascade-cancel the coach's clients on Stripe Connect. Without this,
        // the coach loses platform access but their client subscriptions on
        // their connected account keep renewing — and the coach has no UI to
        // stop them, so clients get charged indefinitely.
        //
        // Trial-immediate cancel → cancel client subs immediately.
        // Period-end cancel → mark client subs cancel_at_period_end so clients
        // finish the period they already paid for and then stop renewing.
        // The stripe-connect-webhook handler reconciles DB state from the
        // resulting subscription.updated/deleted events, so this inline write
        // is best-effort.
        if (coach.stripe_connect_account_id) {
            const { data: clientSubs, error: subsError } = await supabase
                .from('client_subscriptions')
                .select('id, stripe_subscription_id')
                .eq('coach_id', coach.id)
                .in('status', ['active', 'trialing'])
                .not('stripe_subscription_id', 'is', null);

            if (subsError) {
                console.error('Failed to load client_subscriptions for cascade:', subsError);
            } else if (clientSubs?.length) {
                const stripeAccount = coach.stripe_connect_account_id;
                const cascadeAt = new Date().toISOString();

                await Promise.allSettled(clientSubs.map(async (sub) => {
                    try {
                        if (immediatelyCanceled) {
                            await stripe.subscriptions.cancel(
                                sub.stripe_subscription_id,
                                { stripeAccount }
                            );
                            await supabase
                                .from('client_subscriptions')
                                .update({
                                    status: 'canceled',
                                    cancel_at: null,
                                    canceled_at: cascadeAt,
                                    updated_at: cascadeAt
                                })
                                .eq('id', sub.id);
                        } else {
                            const updated = await stripe.subscriptions.update(
                                sub.stripe_subscription_id,
                                { cancel_at_period_end: true },
                                { stripeAccount }
                            );
                            await supabase
                                .from('client_subscriptions')
                                .update({
                                    status: 'canceling',
                                    cancel_at: new Date(updated.current_period_end * 1000).toISOString(),
                                    canceled_at: cascadeAt,
                                    updated_at: cascadeAt
                                })
                                .eq('id', sub.id);
                        }
                    } catch (err) {
                        if (err.code === 'resource_missing') {
                            // Subscription already gone on Stripe — sync DB and move on.
                            await supabase
                                .from('client_subscriptions')
                                .update({
                                    status: 'canceled',
                                    canceled_at: cascadeAt,
                                    updated_at: cascadeAt
                                })
                                .eq('id', sub.id);
                            return;
                        }
                        console.error(
                            `Cascade-cancel failed for client_subscription ${sub.id} (stripe ${sub.stripe_subscription_id}):`,
                            err.message || err
                        );
                        throw err;
                    }
                }));
            }
        }

        // Send cancellation confirmation email
        try {
            const { sendCancellationEmail, sendCancellationNotification } = require('./utils/email-service');
            await sendCancellationEmail({
                coach,
                cancelDate,
                immediatelyCanceled
            });
            // Notify admin
            await sendCancellationNotification({
                coach,
                plan: coach.subscription_tier,
                immediatelyCanceled
            });
        } catch (emailError) {
            console.error('Failed to send cancellation email:', emailError);
            // Don't fail the request if email fails
        }

        // Return appropriate response based on cancellation type
        if (immediatelyCanceled) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Your trial has been canceled. You no longer have access to premium features.',
                    immediatelyCanceled: true
                })
            };
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
