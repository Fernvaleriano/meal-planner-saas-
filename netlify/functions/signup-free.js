const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

    try {
        const { email, name } = JSON.parse(event.body || '{}');

        if (!email || !name) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Name and email are required' })
            };
        }

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
        const tempPassword = generateTempPassword();

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: false
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

        // Generate password reset link and send welcome email
        try {
            const redirectUrl = `${process.env.URL || 'https://ziquefitnessnutrition.com'}/set-password.html`;
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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
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
