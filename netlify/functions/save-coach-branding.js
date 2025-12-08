/**
 * Save Coach Branding
 *
 * Updates branding settings for a coach.
 * Requires Professional tier subscription.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Validate hex color format
function isValidHexColor(color) {
    if (!color) return true; // null/undefined is valid (will use default)
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    try {
        // Verify authentication
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Verify user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid token' })
            };
        }

        // Check coach exists and has branding access
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('id, subscription_tier')
            .eq('id', user.id)
            .single();

        if (coachError || !coach) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        // Check subscription tier
        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
        if (!hasBrandingAccess) {
            return {
                statusCode: 403,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    error: 'Branding features require Professional tier',
                    upgrade_required: true
                })
            };
        }

        // Parse request body
        const body = JSON.parse(event.body);
        const {
            brand_name,
            brand_primary_color,
            brand_secondary_color,
            brand_accent_color,
            brand_email_footer
        } = body;

        // Validate colors
        const colors = [
            { name: 'primary', value: brand_primary_color },
            { name: 'secondary', value: brand_secondary_color },
            { name: 'accent', value: brand_accent_color }
        ];

        for (const color of colors) {
            if (color.value && !isValidHexColor(color.value)) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({
                        error: `Invalid ${color.name} color format. Use hex format like #0d9488`
                    })
                };
            }
        }

        // Validate brand name length
        if (brand_name && brand_name.length > 100) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Brand name must be 100 characters or less' })
            };
        }

        // Validate email footer length
        if (brand_email_footer && brand_email_footer.length > 500) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Email footer must be 500 characters or less' })
            };
        }

        // Build update object (only include fields that were provided)
        const updateData = {
            branding_updated_at: new Date().toISOString()
        };

        // Only update fields that were explicitly provided
        if (body.hasOwnProperty('brand_name')) {
            updateData.brand_name = brand_name || null;
        }
        if (body.hasOwnProperty('brand_primary_color')) {
            updateData.brand_primary_color = brand_primary_color || null;
        }
        if (body.hasOwnProperty('brand_secondary_color')) {
            updateData.brand_secondary_color = brand_secondary_color || null;
        }
        if (body.hasOwnProperty('brand_accent_color')) {
            updateData.brand_accent_color = brand_accent_color || null;
        }
        if (body.hasOwnProperty('brand_email_footer')) {
            updateData.brand_email_footer = brand_email_footer || null;
        }

        // Update branding
        const { data: updated, error: updateError } = await supabase
            .from('coaches')
            .update(updateData)
            .eq('id', user.id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating branding:', updateError);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to save branding' })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: 'Branding saved successfully',
                branding: {
                    brand_name: updated.brand_name,
                    brand_primary_color: updated.brand_primary_color,
                    brand_secondary_color: updated.brand_secondary_color,
                    brand_accent_color: updated.brand_accent_color,
                    brand_logo_url: updated.brand_logo_url,
                    brand_favicon_url: updated.brand_favicon_url,
                    brand_email_logo_url: updated.brand_email_logo_url,
                    brand_email_footer: updated.brand_email_footer,
                    branding_updated_at: updated.branding_updated_at
                }
            })
        };

    } catch (error) {
        console.error('Error in save-coach-branding:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
