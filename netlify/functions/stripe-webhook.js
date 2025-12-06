const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    const sig = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            webhookSecret
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return {
            statusCode: 400,
            body: `Webhook Error: ${err.message}`
        };
    }

    console.log('Stripe webhook event:', stripeEvent.type);

    try {
        switch (stripeEvent.type) {
            case 'checkout.session.completed':
                await handleCheckoutComplete(stripeEvent.data.object);
                break;

            case 'customer.subscription.created':
                await handleSubscriptionCreated(stripeEvent.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(stripeEvent.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(stripeEvent.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(stripeEvent.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(stripeEvent.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };

    } catch (error) {
        console.error('Webhook handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// Handle successful checkout - create or update coach account
async function handleCheckoutComplete(session) {
    console.log('Processing checkout.session.completed:', session.id);

    const email = session.customer_email || session.customer_details?.email;
    const plan = session.metadata?.plan || 'starter';
    const coachName = session.metadata?.coach_name || '';
    const coachId = session.metadata?.coach_id || null;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!email) {
        console.error('No email in checkout session');
        return;
    }

    // Check if coach already exists (by ID first, then email)
    let existingCoach = null;

    if (coachId) {
        const { data } = await supabase
            .from('coaches')
            .select('id, email, subscription_status')
            .eq('id', coachId)
            .single();
        existingCoach = data;
    }

    if (!existingCoach) {
        const { data } = await supabase
            .from('coaches')
            .select('id, email, subscription_status')
            .eq('email', email)
            .single();
        existingCoach = data;
    }

    if (existingCoach) {
        // Existing coach - this is a reactivation or plan change
        const isReactivation = existingCoach.subscription_status === 'canceled' ||
                               existingCoach.subscription_status === 'canceling';

        // Get subscription details to check if trial or active
        let newStatus = 'active';
        let trialEndsAt = null;

        if (subscriptionId) {
            try {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                if (subscription.status === 'trialing') {
                    newStatus = 'trialing';
                    trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
                } else {
                    newStatus = subscription.status;
                }
            } catch (e) {
                console.log('Could not retrieve subscription:', e.message);
            }
        }

        await supabase
            .from('coaches')
            .update({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                subscription_tier: plan,
                subscription_status: newStatus,
                trial_ends_at: trialEndsAt,
                canceled_at: null,  // Clear cancellation fields
                cancel_at: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingCoach.id);

        // Update subscriptions table too
        await supabase
            .from('subscriptions')
            .upsert({
                coach_id: existingCoach.id,
                tier: plan,
                status: newStatus,
                stripe_subscription_id: subscriptionId,
                trial_ends_at: trialEndsAt,
                cancel_at: null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'coach_id' });

        // Send reactivation email if this was a reactivation
        if (isReactivation) {
            try {
                const { sendReactivationEmail, sendNewPaymentNotification } = require('./utils/email-service');
                await sendReactivationEmail({
                    coach: { ...existingCoach, name: coachName },
                    plan: plan
                });
                // Notify admin
                await sendNewPaymentNotification({
                    coach: { ...existingCoach, name: coachName },
                    plan: plan,
                    isReactivation: true
                });
                console.log('Sent reactivation email to:', email);
            } catch (emailError) {
                console.error('Error sending reactivation email:', emailError);
            }
        }

        console.log('Updated existing coach:', email, isReactivation ? '(reactivation)' : '');
    } else {
        // Try to create new auth user, handle if already exists
        let userId;
        const tempPassword = generateTempPassword();

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: false
        });

        if (authError) {
            // If user already exists, find them
            if (authError.message && authError.message.includes('already been registered')) {
                console.log('User already exists, looking up by email:', email);

                // List users and find by email
                const { data: userList } = await supabase.auth.admin.listUsers({
                    page: 1,
                    perPage: 1000
                });

                const existingUser = userList?.users?.find(u => u.email === email);
                if (existingUser) {
                    userId = existingUser.id;
                    console.log('Found existing user ID:', userId);
                } else {
                    console.error('Could not find existing user');
                    throw new Error('User exists but could not be found');
                }
            } else {
                console.error('Error creating auth user:', authError);
                throw authError;
            }
        } else {
            userId = authUser.user.id;
            console.log('Created new auth user:', email);
        }

        // Create coach record
        const { error: coachError } = await supabase
            .from('coaches')
            .insert({
                id: userId,
                email: email,
                name: coachName,
                subscription_tier: plan,
                subscription_status: 'trialing',
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString()
            });

        if (coachError) {
            console.error('Error creating coach record:', coachError);
            throw coachError;
        }

        // Create subscription record
        await supabase
            .from('subscriptions')
            .insert({
                coach_id: userId,
                tier: plan,
                status: 'trialing',
                stripe_subscription_id: subscriptionId,
                trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            });

        // Generate password reset link and send custom welcome email
        try {
            const redirectUrl = `${process.env.URL || 'https://ziquefitnessnutrition.com'}/set-password.html`;
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
                type: 'recovery',
                email: email,
                options: {
                    redirectTo: redirectUrl
                }
            });

            if (linkError) {
                console.error('Error generating password reset link:', linkError);
            } else if (linkData?.properties?.action_link) {
                // Send custom welcome email via Resend
                const { sendWelcomeEmail } = require('./utils/email-service');
                const emailResult = await sendWelcomeEmail({
                    coach: { email, name: coachName },
                    plan: plan,
                    resetLink: linkData.properties.action_link
                });

                if (emailResult.success) {
                    console.log('Welcome email sent to:', email);
                } else {
                    console.error('Error sending welcome email:', emailResult.error);
                }
            } else {
                console.error('No action_link in generateLink response');
            }
        } catch (emailError) {
            console.error('Error in welcome email flow:', emailError);
        }

        // Notify admin of new signup
        try {
            const { sendNewCoachNotification } = require('./utils/email-service');
            await sendNewCoachNotification({
                coach: { email, name: coachName },
                plan: plan
            });
            console.log('Sent new coach notification to admin');
        } catch (notifyError) {
            console.error('Error sending admin notification:', notifyError);
        }

        console.log('Created new coach:', email);
    }
}

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
    console.log('Subscription created:', subscription.id);

    const customerId = subscription.customer;

    // Find coach by Stripe customer ID
    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (coach) {
        await supabase
            .from('coaches')
            .update({
                stripe_subscription_id: subscription.id,
                subscription_status: subscription.status,
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', coach.id);
    }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
    console.log('Subscription updated:', subscription.id);

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (coach) {
        // Map Stripe price ID to our tiers
        const priceId = subscription.items.data[0]?.price?.id;
        let tier = 'starter'; // Default to starter

        // Map price IDs to tiers (supports both new and legacy env vars)
        if (priceId === process.env.STRIPE_PRICE_STARTER || priceId === process.env.STRIPE_PRICE_BASIC) {
            tier = 'starter';
        } else if (priceId === process.env.STRIPE_PRICE_GROWTH) {
            tier = 'growth';
        } else if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL || priceId === process.env.STRIPE_PRICE_BRANDED) {
            tier = 'professional';
        }

        await supabase
            .from('coaches')
            .update({
                subscription_status: subscription.status,
                subscription_tier: tier,
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', coach.id);

        // Also update subscriptions table
        await supabase
            .from('subscriptions')
            .update({
                status: subscription.status,
                tier: tier,
                renewal_date: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('coach_id', coach.id);
    }
}

// Handle subscription deleted/canceled
async function handleSubscriptionDeleted(subscription) {
    console.log('Subscription deleted:', subscription.id);

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (coach) {
        await supabase
            .from('coaches')
            .update({
                subscription_status: 'canceled',
                canceled_at: new Date().toISOString()
            })
            .eq('id', coach.id);

        await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('coach_id', coach.id);
    }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
    console.log('Payment succeeded for invoice:', invoice.id);

    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;
    if (!subscriptionId) return;

    // Try to find coach by subscription ID first, then by customer ID
    let coach = null;
    const { data: coachBySubId } = await supabase
        .from('coaches')
        .select('id, email, name, subscription_status')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

    coach = coachBySubId;

    if (!coach && customerId) {
        const { data: coachByCustomerId } = await supabase
            .from('coaches')
            .select('id, email, name, subscription_status')
            .eq('stripe_customer_id', customerId)
            .single();
        coach = coachByCustomerId;
    }

    if (coach) {
        const wasReactivation = coach.subscription_status === 'canceled' ||
                                coach.subscription_status === 'canceling';

        await supabase
            .from('coaches')
            .update({
                subscription_status: 'active',
                stripe_subscription_id: subscriptionId,
                last_payment_at: new Date().toISOString(),
                canceled_at: null,
                cancel_at: null
            })
            .eq('id', coach.id);

        await supabase
            .from('subscriptions')
            .update({
                status: 'active',
                stripe_subscription_id: subscriptionId,
                cancel_at: null
            })
            .eq('coach_id', coach.id);

        console.log('Payment succeeded for coach:', coach.email);
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    console.log('Payment failed for invoice:', invoice.id);

    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;
    if (!subscriptionId) return;

    // Try to find coach by subscription ID first, then by customer ID
    let coach = null;
    const { data: coachBySubId } = await supabase
        .from('coaches')
        .select('id, email, name, subscription_tier')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

    coach = coachBySubId;

    if (!coach && customerId) {
        const { data: coachByCustomerId } = await supabase
            .from('coaches')
            .select('id, email, name, subscription_tier')
            .eq('stripe_customer_id', customerId)
            .single();
        coach = coachByCustomerId;
    }

    if (coach) {
        await supabase
            .from('coaches')
            .update({
                subscription_status: 'past_due'
            })
            .eq('id', coach.id);

        await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('coach_id', coach.id);

        // Send payment failed email
        try {
            const { sendPaymentFailedEmail } = require('./utils/email-service');
            await sendPaymentFailedEmail({ coach });
            console.log('Sent payment failed email to:', coach.email);
        } catch (emailError) {
            console.error('Error sending payment failed email:', emailError);
        }

        console.log('Payment failed for coach:', coach.email);
    }
}

// Generate a random temporary password
function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
