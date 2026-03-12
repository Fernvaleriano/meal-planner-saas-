/**
 * Dynamic PWA Manifest
 *
 * Generates a coach-branded manifest.json for PWA homescreen saves.
 * When a client adds the app to their homescreen, the PWA name and icon
 * will reflect the coach's branding instead of the default "Zique Fitness".
 *
 * Usage: /manifest.json?coachId=<uuid>
 * Falls back to default manifest if no coachId or branding not available.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DEFAULT_MANIFEST = {
    name: 'Zique Fitness Meal Planner',
    short_name: 'Zique Fitness',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0d9488',
    categories: ['health', 'fitness', 'lifestyle'],
    icons: [
        {
            src: '/icons/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
        },
        {
            src: '/icons/logo.png',
            sizes: '500x500',
            type: 'image/png',
            purpose: 'any maskable'
        }
    ]
};

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/manifest+json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600' // 1 hour cache
    };

    const coachId = event.queryStringParameters?.coachId;

    if (!coachId || !SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(DEFAULT_MANIFEST)
        };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: coach, error } = await supabase
            .from('coaches')
            .select('subscription_tier, brand_name, brand_app_name, brand_short_name, brand_primary_color, brand_logo_url, brand_favicon_url')
            .eq('id', coachId)
            .single();

        if (error || !coach) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(DEFAULT_MANIFEST)
            };
        }

        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
        if (!hasBrandingAccess) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(DEFAULT_MANIFEST)
            };
        }

        // Build branded manifest
        const manifest = {
            ...DEFAULT_MANIFEST,
            name: coach.brand_app_name || coach.brand_name || DEFAULT_MANIFEST.name,
            short_name: coach.brand_short_name || (coach.brand_name ? coach.brand_name.substring(0, 12) : DEFAULT_MANIFEST.short_name),
            theme_color: coach.brand_primary_color || DEFAULT_MANIFEST.theme_color,
            start_url: `/app?coachId=${coachId}`,
        };

        // Use coach's logo as icon if available
        if (coach.brand_logo_url || coach.brand_favicon_url) {
            const iconUrl = coach.brand_favicon_url || coach.brand_logo_url;
            manifest.icons = [
                {
                    src: iconUrl,
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any maskable'
                },
                {
                    src: iconUrl,
                    sizes: '500x500',
                    type: 'image/png',
                    purpose: 'any maskable'
                }
            ];
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(manifest)
        };
    } catch (err) {
        console.error('Error generating dynamic manifest:', err);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(DEFAULT_MANIFEST)
        };
    }
};
