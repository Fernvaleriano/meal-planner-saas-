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

// Handle successful checkout - create coach account
async function handleCheckoutComplete(session) {
    console.log('Processing checkout.session.completed:', session.id);

    const email = session.customer_email;
    const plan = session.metadata?.plan || 'starter';
    const coachName = session.metadata?.coach_name || '';
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!email) {
        console.error('No email in checkout session');
        return;
    }

    // Check if coach already exists
    const { data: existingCoach } = await supabase
        .from('coaches')
        .select('id')
        .eq('email', email)
        .single();

    if (existingCoach) {
        // Update existing coach with Stripe info
        await supabase
            .from('coaches')
            .update({
                stripe_customer_id: customerId,
                subscription_tier: plan,
                subscription_status: 'trialing', // 14-day trial
                updated_at: new Date().toISOString()
            })
            .eq('id', existingCoach.id);

        console.log('Updated existing coach:', email);
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

        // Send password reset email so they can set their password
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.URL || 'https://ziquefitnesnutrition.com'}/set-password.html`
        });

        if (resetError) {
            console.error('Error sending password reset email:', resetError);
        } else {
            console.log('Password reset email sent to:', email);
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
    if (!subscriptionId) return;

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

    if (coach) {
        await supabase
            .from('coaches')
            .update({
                subscription_status: 'active',
                last_payment_at: new Date().toISOString()
            })
            .eq('id', coach.id);

        await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('coach_id', coach.id);
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    console.log('Payment failed for invoice:', invoice.id);

    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, email')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

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

        // TODO: Send payment failed email to coach
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
