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

        // All coaches can save branding settings.
        // The subscription tier only controls advanced branding features
        // (e.g., custom domain, white-label) in the UI — basic color/logo
        // customization is available to everyone.

        // Parse request body
        const body = JSON.parse(event.body);
        const {
            brand_name,
            brand_primary_color,
            brand_secondary_color,
            brand_accent_color,
            brand_email_footer,
            brand_bg_color,
            brand_bg_secondary_color,
            brand_card_color,
            brand_text_color,
            brand_text_secondary_color,
            brand_font,
            brand_button_style,
            brand_welcome_message,
            brand_app_name,
            brand_short_name,
            client_modules,
            custom_terminology
        } = body;

        // Validate all color fields
        const colors = [
            { name: 'primary', value: brand_primary_color },
            { name: 'secondary', value: brand_secondary_color },
            { name: 'accent', value: brand_accent_color },
            { name: 'background', value: brand_bg_color },
            { name: 'background secondary', value: brand_bg_secondary_color },
            { name: 'card', value: brand_card_color },
            { name: 'text', value: brand_text_color },
            { name: 'text secondary', value: brand_text_secondary_color }
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

        // Validate welcome message length
        if (brand_welcome_message && brand_welcome_message.length > 200) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Welcome message must be 200 characters or less' })
            };
        }

        // Validate short name length
        if (brand_short_name && brand_short_name.length > 12) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Short name must be 12 characters or less' })
            };
        }

        // Validate button style
        const validButtonStyles = ['rounded', 'sharp', 'pill'];
        if (brand_button_style && !validButtonStyles.includes(brand_button_style)) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Button style must be: rounded, sharp, or pill' })
            };
        }

        // Validate font
        const validFonts = ['System Default', 'Inter', 'Poppins', 'Montserrat', 'Raleway', 'Open Sans', 'Lato', 'Nunito', 'Roboto', 'DM Sans'];
        if (brand_font && !validFonts.includes(brand_font)) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid font selection' })
            };
        }

        // Validate client_modules structure
        const validModuleKeys = ['diary', 'plans', 'workouts', 'messages', 'recipes', 'check_in', 'progress'];
        if (client_modules) {
            if (typeof client_modules !== 'object' || Array.isArray(client_modules)) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'client_modules must be an object' })
                };
            }
            for (const key of Object.keys(client_modules)) {
                if (!validModuleKeys.includes(key)) {
                    return {
                        statusCode: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ error: `Invalid module key: ${key}` })
                    };
                }
                if (typeof client_modules[key] !== 'boolean') {
                    return {
                        statusCode: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ error: `Module value for ${key} must be true or false` })
                    };
                }
            }
        }

        // Validate custom_terminology structure
        const validTermKeys = ['home', 'diary', 'plans', 'workouts', 'messages', 'meals', 'check_in', 'progress', 'recipes'];
        if (custom_terminology) {
            if (typeof custom_terminology !== 'object' || Array.isArray(custom_terminology)) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'custom_terminology must be an object' })
                };
            }
            for (const [key, value] of Object.entries(custom_terminology)) {
                if (!validTermKeys.includes(key)) {
                    return {
                        statusCode: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ error: `Invalid terminology key: ${key}` })
                    };
                }
                if (typeof value !== 'string' || value.length > 30) {
                    return {
                        statusCode: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ error: `Terminology label for ${key} must be a string of 30 characters or less` })
                    };
                }
            }
        }

        // Build update object (only include fields that were provided)
        const updateData = {
            branding_updated_at: new Date().toISOString()
        };

        // Helper: set field if it was explicitly provided in the request
        const setIfProvided = (field, value) => {
            if (body.hasOwnProperty(field)) {
                updateData[field] = value || null;
            }
        };

        // V1 fields
        setIfProvided('brand_name', brand_name);
        setIfProvided('brand_primary_color', brand_primary_color);
        setIfProvided('brand_secondary_color', brand_secondary_color);
        setIfProvided('brand_accent_color', brand_accent_color);
        setIfProvided('brand_email_footer', brand_email_footer);

        // V2: Extended palette
        setIfProvided('brand_bg_color', brand_bg_color);
        setIfProvided('brand_bg_secondary_color', brand_bg_secondary_color);
        setIfProvided('brand_card_color', brand_card_color);
        setIfProvided('brand_text_color', brand_text_color);
        setIfProvided('brand_text_secondary_color', brand_text_secondary_color);
        setIfProvided('brand_font', brand_font === 'System Default' ? null : brand_font);
        setIfProvided('brand_button_style', brand_button_style);

        // V2: Client experience
        setIfProvided('brand_welcome_message', brand_welcome_message);
        setIfProvided('brand_app_name', brand_app_name);
        setIfProvided('brand_short_name', brand_short_name);

        // V2: Module visibility & terminology (JSONB — store directly)
        if (body.hasOwnProperty('client_modules')) {
            updateData.client_modules = client_modules || null;
        }
        if (body.hasOwnProperty('custom_terminology')) {
            updateData.custom_terminology = custom_terminology || null;
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
                    brand_bg_color: updated.brand_bg_color,
                    brand_bg_secondary_color: updated.brand_bg_secondary_color,
                    brand_card_color: updated.brand_card_color,
                    brand_text_color: updated.brand_text_color,
                    brand_text_secondary_color: updated.brand_text_secondary_color,
                    brand_font: updated.brand_font,
                    brand_button_style: updated.brand_button_style,
                    brand_welcome_message: updated.brand_welcome_message,
                    brand_app_name: updated.brand_app_name,
                    brand_short_name: updated.brand_short_name,
                    client_modules: updated.client_modules,
                    custom_terminology: updated.custom_terminology,
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
