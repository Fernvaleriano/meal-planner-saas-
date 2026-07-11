/**
 * Per-coach apple-touch-icon.
 *
 * iOS reads <link rel="apple-touch-icon"> from the served HTML before any of
 * our JavaScript runs, so a hardcoded icon always wins over the branding we
 * apply client-side. This endpoint lets the static link resolve to the right
 * gym's icon: it reads the coach id from ?coachId or the zq_coach cookie,
 * looks up that coach's favicon/logo, and 302-redirects to it.
 *
 * Falls back to the default Ziquecoach icon when there's no coach, no branding
 * access, or any error — so the worst case is exactly today's behavior.
 *
 * Usage: <link rel="apple-touch-icon" href="/.netlify/functions/coach-icon">
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DEFAULT_ICON = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/icons/logo.png';

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

function redirect(url) {
    return {
        statusCode: 302,
        headers: {
            Location: url,
            // Private + short so a shared device doesn't cache one gym's icon
            // for another, but repeated loads within a session stay cheap.
            'Cache-Control': 'private, max-age=300',
            'Vary': 'Cookie'
        },
        body: ''
    };
}

exports.handler = async (event) => {
    const coachId = event.queryStringParameters?.coachId
        || readCookie(event.headers?.cookie || event.headers?.Cookie, 'zq_coach');

    if (!coachId || !SUPABASE_SERVICE_KEY) {
        return redirect(DEFAULT_ICON);
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data: coach, error } = await supabase
            .from('coaches')
            .select('subscription_tier, brand_favicon_url, brand_logo_url')
            .eq('id', coachId)
            .single();

        if (error || !coach) return redirect(DEFAULT_ICON);

        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
        if (!hasBrandingAccess) return redirect(DEFAULT_ICON);

        const iconUrl = coach.brand_favicon_url || coach.brand_logo_url;
        return redirect(iconUrl || DEFAULT_ICON);
    } catch (err) {
        console.error('coach-icon error:', err);
        return redirect(DEFAULT_ICON);
    }
};
