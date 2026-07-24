const { createClient } = require('@supabase/supabase-js');
const { checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Best-effort client IP for rate limiting unauthenticated callers.
function clientIp(event) {
    return event.headers['x-nf-client-connection-ip']
        || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || 'unknown';
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Rate limit account creation per IP — this calls auth.admin.createUser, so
    // an open loop could mass-create coach accounts.
    const rl = await checkRateLimitDurable(clientIp(event), 'signup-free', 5, 60 * 60 * 1000);
    if (!rl.allowed) return { ...rateLimitResponse(rl.resetIn), headers: { ...headers, 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } };

    try {
        const { email, name, password } = JSON.parse(event.body || '{}');

        if (!email || !name) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Name and email are required' })
            };
        }

        // If the coach chose a password on the signup form we create the
        // account with it and log them straight in (no "set your password"
        // email round-trip). When no password is supplied we fall back to the
        // original flow: a random temp password + a recovery email.
        const hasChosenPassword = typeof password === 'string' && password.length >= 8;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false }
        });

        // Check if email is already registered as a coach
        const { data: existingCoach } = await supabase
            .from('coaches')
            .select('id, email')
            .ilike('email', email)
            .single();

        if (existingCoach) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'This email is already registered. Please log in instead.' })
            };
        }

        // Create auth user
        let userId;
        const accountPassword = hasChosenPassword ? password : generateTempPassword();

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: accountPassword,
            // Confirm the email up front when they set their own password so
            // they can be signed in immediately; otherwise keep it unconfirmed
            // (the recovery email path confirms it when they set a password).
            email_confirm: hasChosenPassword
        });

        if (authError) {
            if (authError.message && authError.message.includes('already been registered')) {
                // User exists in auth but not as coach - find them
                const { data: userList } = await supabase.auth.admin.listUsers({
                    page: 1,
                    perPage: 1000
                });

                const existingUser = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
                if (existingUser) {
                    userId = existingUser.id;
                    // Adopt the password they just chose so the auto-login below
                    // works for an auth user that never finished coach signup.
                    if (hasChosenPassword) {
                        await supabase.auth.admin.updateUserById(userId, {
                            password: accountPassword,
                            email_confirm: true
                        });
                    }
                } else {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'This email is already registered. Please log in instead.' })
                    };
                }
            } else {
                console.error('Error creating auth user:', authError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Failed to create account. Please try again.' })
                };
            }
        } else {
            userId = authUser.user.id;
        }

        // Create coach record with free tier
        const { error: coachError } = await supabase
            .from('coaches')
            .insert({
                id: userId,
                email: email,
                name: name,
                subscription_tier: 'free',
                subscription_status: 'active',
                created_at: new Date().toISOString()
            });

        if (coachError) {
            console.error('Error creating coach record:', coachError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to create coach profile. Please try again.' })
            };
        }

        // Usage analytics: record the completed signup (funnel counterpart to
        // signup.html pageviews). Never allowed to fail the signup itself.
        try {
            await supabase.from('usage_events').insert({
                event: 'signup_completed',
                page: '/signup.html',
                role: 'coach',
                user_id: userId
            });
        } catch (trackError) {
            console.error('signup tracking failed (ignored):', trackError.message);
        }

        // Only send the "set your password" welcome email when they did NOT
        // choose a password at signup. If they did, their account is already
        // usable and we log them straight in on the client.
        if (!hasChosenPassword) {
            try {
                const redirectUrl = `${process.env.URL || 'https://ziquecoach.com'}/set-password.html`;
                const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email: email,
                    options: {
                        redirectTo: redirectUrl
                    }
                });

                if (!linkError && linkData?.properties?.action_link) {
                    const { sendWelcomeEmail } = require('./utils/email-service');
                    await sendWelcomeEmail({
                        coach: { email, name },
                        plan: 'free',
                        resetLink: linkData.properties.action_link
                    });
                } else {
                    console.error('Error generating password reset link:', linkError);
                }
            } catch (emailError) {
                // Don't fail signup if email fails
                console.error('Error sending welcome email:', emailError);
            }
        }

        return {
            statusCode: 200,
            headers,
            // autoLogin tells the client it can sign the coach in right away
            // with the password they chose, instead of routing them to login.
            body: JSON.stringify({ success: true, autoLogin: hasChosenPassword })
        };

    } catch (error) {
        console.error('Signup free error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
