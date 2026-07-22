/**
 * coach-links.js — Build the RIGHT destination for links inside coach/gym emails.
 *
 * Two things this solves so an email button always lands the reader in the
 * correct spot:
 *
 *   1. RIGHT WEB ADDRESS. A white-label gym has its own domain (e.g. Huracan
 *      on huracan-fitness.com). Their email buttons should open THAT domain,
 *      not the shared ziquecoach.com. Every other coach uses the shared app.
 *
 *   2. RIGHT HOME PAGE. A gym OWNER's home is gym-dashboard.html; a regular
 *      coach's home is coach-command-center.html. "See the full picture" and
 *      similar buttons should point each account type at its own home.
 *
 * Keep WHITE_LABEL_ORIGINS in sync with the hostname→brand_slug maps in
 * staff-login.js and gym-join-page.js (same white-label gyms, mapped the
 * other direction). Only gyms with their own branded web address belong here.
 */

// brand_slug → the gym's preferred branded origin (no trailing slash).
const WHITE_LABEL_ORIGINS = {
    'huracan-fitness': 'https://huracan-fitness.com',
    'goliath-strength': 'https://goliath.ziquecoach.com'
};

// The shared app address (Netlify sets process.env.URL to the live site).
function defaultOrigin() {
    return process.env.URL || 'https://ziquecoach.com';
}

/**
 * The origin (scheme + host) a link for this coach/gym should use.
 * White-label gym → their own domain; everyone else → the shared app.
 * @param {Object} coach - a coaches row (needs brand_slug for white-label).
 */
function coachOrigin(coach) {
    const slug = coach && coach.brand_slug;
    if (slug && WHITE_LABEL_ORIGINS[slug]) return WHITE_LABEL_ORIGINS[slug];
    return defaultOrigin();
}

/**
 * The dashboard "home" page for this account type.
 * Gym owner → gym-dashboard.html; regular coach → coach-command-center.html.
 * @param {Object} coach - a coaches row (needs is_gym).
 */
function coachHomePath(coach) {
    return coach && coach.is_gym ? 'gym-dashboard.html' : 'coach-command-center.html';
}

/** Full URL for a given path on this coach's correct origin. */
function coachUrl(coach, path) {
    return `${coachOrigin(coach)}/${String(path).replace(/^\/+/, '')}`;
}

/** Full URL to this coach/gym's own home dashboard. */
function coachHomeUrl(coach) {
    return coachUrl(coach, coachHomePath(coach));
}

module.exports = {
    WHITE_LABEL_ORIGINS,
    defaultOrigin,
    coachOrigin,
    coachHomePath,
    coachUrl,
    coachHomeUrl
};
