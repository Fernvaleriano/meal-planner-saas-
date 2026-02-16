/**
 * Get Coach Branding
 *
 * Fetches branding settings for a coach - used by both coach settings
 * and client portals to apply custom branding.
 *
 * Can be called with:
 * - coachId parameter (for client portals)
 * - Authorization header (for coach's own branding)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Default branding values (Zique Fitness defaults)
const DEFAULT_BRANDING = {
    brand_name: 'Zique Fitness Nutrition',
    brand_primary_color: '#0d9488',
    brand_secondary_color: '#0284c7',
    brand_accent_color: '#10b981',
    brand_logo_url: null,
    brand_favicon_url: null,
    brand_email_logo_url: null,
    brand_email_footer: null
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
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
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Get coachId from query params or from auth token
        let coachId = event.queryStringParameters?.coachId;

        // If no coachId provided, try to get from Authorization header
        if (!coachId) {
            const authHeader = event.headers.authorization || event.headers.Authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);

                if (!authError && user) {
                    coachId = user.id;
                }
            }
        }

        if (!coachId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach ID required' })
            };
        }

        // Fetch coach branding and subscription info
        const { data: coach, error: fetchError } = await supabase
            .from('coaches')
            .select(`
                id,
                name,
                subscription_tier,
                brand_name,
                brand_logo_url,
                brand_favicon_url,
                brand_primary_color,
                brand_secondary_color,
                brand_accent_color,
                brand_email_logo_url,
                brand_email_footer,
                branding_updated_at,
                profile_photo_url
            `)
            .eq('id', coachId)
            .single();

        if (fetchError) {
            console.error('Error fetching coach branding:', fetchError);
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        // Check if coach has Professional tier (branding feature access)
        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);

        // Build branding response with fallbacks to defaults
        const branding = {
            coach_id: coach.id,
            coach_name: coach.name,
            has_branding_access: hasBrandingAccess,
            subscription_tier: coach.subscription_tier,

            // Brand identity (with fallbacks)
            brand_name: coach.brand_name || DEFAULT_BRANDING.brand_name,
            brand_logo_url: coach.brand_logo_url || coach.profile_photo_url || DEFAULT_BRANDING.brand_logo_url,
            brand_favicon_url: coach.brand_favicon_url || DEFAULT_BRANDING.brand_favicon_url,

            // Colors (with fallbacks)
            brand_primary_color: coach.brand_primary_color || DEFAULT_BRANDING.brand_primary_color,
            brand_secondary_color: coach.brand_secondary_color || DEFAULT_BRANDING.brand_secondary_color,
            brand_accent_color: coach.brand_accent_color || DEFAULT_BRANDING.brand_accent_color,

            // Email branding (with fallbacks)
            brand_email_logo_url: coach.brand_email_logo_url || coach.brand_logo_url || DEFAULT_BRANDING.brand_email_logo_url,
            brand_email_footer: coach.brand_email_footer || DEFAULT_BRANDING.brand_email_footer,

            // Metadata
            branding_updated_at: coach.branding_updated_at,

            // Include raw values for editing (nulls preserved)
            raw: hasBrandingAccess ? {
                brand_name: coach.brand_name,
                brand_logo_url: coach.brand_logo_url,
                brand_favicon_url: coach.brand_favicon_url,
                brand_primary_color: coach.brand_primary_color,
                brand_secondary_color: coach.brand_secondary_color,
                brand_accent_color: coach.brand_accent_color,
                brand_email_logo_url: coach.brand_email_logo_url,
                brand_email_footer: coach.brand_email_footer
            } : null
        };

        // If coach doesn't have branding access, return defaults
        if (!hasBrandingAccess) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    ...branding,
                    ...DEFAULT_BRANDING,
                    coach_name: coach.name,
                    has_branding_access: false
                })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(branding)
        };

    } catch (error) {
        console.error('Error in get-coach-branding:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
