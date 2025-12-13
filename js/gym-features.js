/**
 * Gym Features Helper
 * Checks if gym features are enabled for the current user/coach
 */

// Beta users with gym features enabled (by email)
const GYM_BETA_EMAILS = [
  'valeriano_fernando@yahoo.com',
  'contact@ziquefitness.com'
];

/**
 * Check if gym features are enabled for the given email (local check)
 * @param {string} email - User's email address
 * @returns {boolean} - Whether gym features are enabled
 */
function isGymFeaturesEnabledByEmail(email) {
    if (!email) return false;
    return GYM_BETA_EMAILS.includes(email.toLowerCase());
}

/**
 * Check gym features via API
 * @param {Object|string} params - { email, coachId } or just email string for backwards compatibility
 * @returns {Promise<boolean>} - Whether gym features are enabled
 */
async function checkGymFeatures(params) {
    try {
        // Support both object and string params for backwards compatibility
        let email, coachId;
        if (typeof params === 'string') {
            email = params;
        } else {
            email = params?.email;
            coachId = params?.coachId;
        }

        // Quick local check if email provided
        if (email && isGymFeaturesEnabledByEmail(email)) {
            return true;
        }

        // API check
        let url = '/.netlify/functions/gym-features?';
        if (email) {
            url += `email=${encodeURIComponent(email)}`;
        } else if (coachId) {
            url += `coachId=${encodeURIComponent(coachId)}`;
        } else {
            return false;
        }

        const response = await fetch(url);
        const data = await response.json();
        return data.enabled === true;
    } catch (err) {
        console.error('Error checking gym features:', err);
        return false;
    }
}

/**
 * Show/hide gym-related elements based on feature flag
 * @param {Object|string} params - { email, coachId } or just email string
 */
async function initGymFeatures(params) {
    const enabled = await checkGymFeatures(params);

    // Show/hide elements with data-gym-feature attribute
    document.querySelectorAll('[data-gym-feature]').forEach(el => {
        if (enabled) {
            el.style.display = '';
            el.classList.remove('gym-hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('gym-hidden');
        }
    });

    // Add class to body for CSS-based hiding
    if (enabled) {
        document.body.classList.add('gym-features-enabled');
    } else {
        document.body.classList.remove('gym-features-enabled');
    }

    return enabled;
}

// Backwards compatibility alias
const isGymFeaturesEnabled = isGymFeaturesEnabledByEmail;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isGymFeaturesEnabled, isGymFeaturesEnabledByEmail, checkGymFeatures, initGymFeatures };
}
