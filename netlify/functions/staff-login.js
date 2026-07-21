/**
 * Branded STAFF (coach + trainer) login address.
 *
 *   https://ziquecoach.com/staff/<slug>      (shared domain)
 *   https://<gym-domain>/staff               (their own white-label domain)
 *
 * netlify.toml rewrites /staff and /staff/* to this function. It's the staff
 * mirror of gym-login.js (which does the same for the MEMBER login): resolve
 * the gym by their brand_slug — from the path, or from the white-label
 * hostname — and redirect to the normal staff login page with ?coachId set, so
 * login.html skins itself with that gym's logo, name and colours.
 *
 * With no slug / an unknown gym it falls back to the plain, unbranded
 * /login.html — a mistyped link still lands somewhere useful.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// White-label gym domains → brand_slug. Same map used by index.html /
// gym-join-page.js for the member side; kept in sync when a gym is added.
const GYM_DOMAINS = {
    'huracan.ziquecoach.com': 'huracan-fitness',
    'huracan-fitness.com': 'huracan-fitness',
    'www.huracan-fitness.com': 'huracan-fitness',
    'goliath.ziquecoach.com': 'goliath-strength'
};

function redirect(url, cacheable) {
    return {
        statusCode: 302,
        headers: {
            Location: url,
            'Cache-Control': cacheable ? 'public, max-age=300' : 'no-store'
        },
        body: ''
    };
}

exports.handler = async (event) => {
    // Slug can arrive via ?slug= (from the /staff/* rewrite), the raw path, or
    // — on a gym's own domain hitting bare /staff — the hostname map.
    const host = (event.headers && (event.headers.host || event.headers.Host) || '').toLowerCase();
    const rawFromQuery = event.queryStringParameters?.slug || '';
    const rawFromPath = (event.path || '').replace(/^\/staff\/?/, '').split('/').filter(Boolean).pop() || '';
    let slug = decodeURIComponent(rawFromQuery || rawFromPath).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug && GYM_DOMAINS[host]) slug = GYM_DOMAINS[host];

    if (!slug || !SUPABASE_SERVICE_KEY) {
        return redirect('/login.html', false);
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data: coach, error } = await supabase
            .from('coaches')
            .select('id')
            .eq('brand_slug', slug)
            .single();

        if (!error && coach) {
            return redirect('/login.html?coachId=' + coach.id, true);
        }
    } catch (err) {
        console.error('staff-login error:', err);
    }

    return redirect('/login.html', false);
};
