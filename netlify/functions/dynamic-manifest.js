/**
 * Dynamic PWA Manifest
 *
 * Generates a coach-branded manifest.json for PWA homescreen saves.
 * When a client adds the app to their homescreen, the PWA name and icon
 * will reflect the coach's branding instead of the default "Ziquecoach".
 *
 * Usage: /manifest.json?coachId=<uuid>
 * Falls back to default manifest if no coachId or branding not available.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DEFAULT_MANIFEST = {
    name: 'Ziquecoach Meal Planner',
    short_name: 'Ziquecoach',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#2cb5a5',
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

// Platform hosts — anything else serving this site is a coach's white-label
// custom domain and resolves to that coach's branding.
function isPlatformHost(host) {
    if (!host) return true;
    const h = String(host).toLowerCase().split(':')[0];
    return h === 'ziquecoach.com' || h === 'www.ziquecoach.com'
        || h === 'ziquefitnessnutrition.com' || h === 'www.ziquefitnessnutrition.com'
        || h.endsWith('.netlify.app') || h === 'localhost' || h === '127.0.0.1';
}

// Resolve a coach id from the request's Host header (custom domain).
async function coachIdFromHost(event) {
    const host = event.headers?.host || event.headers?.Host;
    if (isPlatformHost(host) || !SUPABASE_SERVICE_KEY) return null;
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data } = await supabase
            .from('coaches')
            .select('id')
            .eq('custom_domain', String(host).toLowerCase().split(':')[0])
            .maybeSingle();
        return data?.id || null;
    } catch (err) {
        console.error('custom-domain lookup failed:', err);
        return null;
    }
}

// Pull a named cookie value out of a Cookie header.
function readCookie(cookieHeader, name) {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(/;\s*/);
    for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/manifest+json',
        // Per-user manifest: iOS/Safari only send cookies for the manifest fetch
        // when the <link> has crossorigin="use-credentials", which in turn needs
        // these credentialed CORS headers (same-origin, so echo the origin).
        'Access-Control-Allow-Origin': event.headers?.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        // Short cache + Vary on cookie so different gyms don't share a cached
        // manifest, but we still avoid re-generating on every single load.
        'Cache-Control': 'private, max-age=300',
        'Vary': 'Cookie'
    };

    // Prefer an explicit ?coachId, fall back to the zq_coach cookie so the
    // static <link rel="manifest"> (which iOS reads before our JS runs) still
    // resolves to the right gym. Final fallback: the request's Host header —
    // a coach's custom domain resolves to that coach even with no cookie at
    // all (critical for Android's cookie-less install packaging).
    const coachId = event.queryStringParameters?.coachId
        || readCookie(event.headers?.cookie || event.headers?.Cookie, 'zq_coach')
        || await coachIdFromHost(event);

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
