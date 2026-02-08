/**
 * Gym Features Helper
 * Workout/gym features are now enabled for all coaches.
 */

/**
 * Check if gym features are enabled (always returns true)
 * @param {string} email - User's email address
 * @returns {boolean} - Whether gym features are enabled
 */
function isGymFeaturesEnabledByEmail(email) {
    return true;
}

/**
 * Check gym features (always returns true - enabled for all coaches)
 * @param {Object|string} params - { email, coachId } or just email string for backwards compatibility
 * @returns {Promise<boolean>} - Whether gym features are enabled
 */
async function checkGymFeatures(params) {
    return true;
}

/**
 * Show/hide gym-related elements based on feature flag
 * @param {Object|string} params - { email, coachId } or just email string
 */
async function initGymFeatures(params) {
    // Gym features enabled for all coaches - show all gym elements
    document.querySelectorAll('[data-gym-feature]').forEach(el => {
        el.style.display = '';
        el.classList.remove('gym-hidden');
    });

    document.body.classList.add('gym-features-enabled');

    return true;
}

// Backwards compatibility alias
const isGymFeaturesEnabled = isGymFeaturesEnabledByEmail;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isGymFeaturesEnabled, isGymFeaturesEnabledByEmail, checkGymFeatures, initGymFeatures };
}
