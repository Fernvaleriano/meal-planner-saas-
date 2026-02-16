/**
 * Save White-Label Email Settings
 *
 * Allows coaches to configure a custom from-address for client emails.
 * Requires Professional tier subscription.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Basic email validation
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // Verify authentication
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
        }

        // Get coach and check tier
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('id, subscription_tier, white_label_enabled, email_from, email_from_name, email_from_verified')
            .eq('id', user.id)
            .single();

        if (coachError || !coach) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Coach not found' }) };
        }

        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
        if (!hasBrandingAccess) {
            return {
                statusCode: 403, headers,
                body: JSON.stringify({ error: 'White-label email requires Professional tier', upgrade_required: true })
            };
        }

        // GET - Return current white-label email settings
        if (event.httpMethod === 'GET') {
            return {
                statusCode: 200, headers,
                body: JSON.stringify({
                    white_label_enabled: coach.white_label_enabled || false,
                    email_from: coach.email_from || '',
                    email_from_name: coach.email_from_name || '',
                    email_from_verified: coach.email_from_verified || false
                })
            };
        }

        // POST - Update white-label email settings
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const { email_from, email_from_name, white_label_enabled } = body;

            // Validate email if provided
            if (email_from && !isValidEmail(email_from)) {
                return {
                    statusCode: 400, headers,
                    body: JSON.stringify({ error: 'Invalid email address format' })
                };
            }

            // Validate name length
            if (email_from_name && email_from_name.length > 100) {
                return {
                    statusCode: 400, headers,
                    body: JSON.stringify({ error: 'From name must be 100 characters or less' })
                };
            }

            const updateData = {};

            if (body.hasOwnProperty('white_label_enabled')) {
                updateData.white_label_enabled = white_label_enabled;
            }

            if (body.hasOwnProperty('email_from_name')) {
                updateData.email_from_name = email_from_name || null;
            }

            if (body.hasOwnProperty('email_from')) {
                // If the email changed, reset verification
                if (email_from !== coach.email_from) {
                    updateData.email_from = email_from || null;
                    updateData.email_from_verified = false;
                } else {
                    updateData.email_from = email_from || null;
                }
            }

            const { data: updated, error: updateError } = await supabase
                .from('coaches')
                .update(updateData)
                .eq('id', user.id)
                .select('white_label_enabled, email_from, email_from_name, email_from_verified')
                .single();

            if (updateError) {
                console.error('Error updating white-label email:', updateError);
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save settings' }) };
            }

            return {
                statusCode: 200, headers,
                body: JSON.stringify({
                    success: true,
                    message: 'White-label email settings saved',
                    settings: updated
                })
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (error) {
        console.error('Error in save-white-label-email:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
