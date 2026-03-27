/**
 * Zique Fitness Nutrition - Dark Mode Theme Manager
 * Handles theme switching and persistence
 */

(function() {
    'use strict';

    const THEME_KEY = 'zique-theme';
    const COACH_THEME_KEY = 'coach_client_theme';
    const USER_OVERRIDE_KEY = 'zique-theme-user-override';
    const DARK = 'dark';
    const LIGHT = 'light';

    // ANTI-FLASH: Inject a <style> into <head> IMMEDIATELY — before any other
    // CSS is parsed or body exists. This forces html+body to the correct theme
    // background using !important so it beats every inline <style> block in every
    // page.  We remove it on window.load once real CSS is fully applied.
    var antiFlash = document.createElement('style');
    antiFlash.id = 'zique-anti-flash';
    antiFlash.textContent =
        'html,body{background:#0f172a!important;color:#f1f5f9!important}' +
        'html[data-theme="light"],html[data-theme="light"] body{background:#f8fafc!important;color:#1e293b!important}';
    document.head.appendChild(antiFlash);

    // Remove the anti-flash guard once all CSS (including external) has loaded
    window.addEventListener('load', function() {
        var el = document.getElementById('zique-anti-flash');
        if (el) el.remove();
    });

    // Initialize theme on page load (runs immediately)
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        const userOverride = localStorage.getItem(USER_OVERRIDE_KEY) === 'true';
        const coachTheme = localStorage.getItem(COACH_THEME_KEY);

        // Priority: user manual override > saved preference > coach theme > default dark
        var theme;
        if (userOverride && savedTheme) {
            // Client has manually toggled — respect their choice
            theme = savedTheme;
        } else if (savedTheme) {
            // User has a saved theme preference — use it even without override flag.
            // This prevents coach theme from overwriting a previously chosen preference.
            theme = savedTheme;
        } else if (coachTheme) {
            // No saved preference — use coach's default theme for clients
            if (coachTheme === 'system') {
                theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
            } else {
                theme = coachTheme;
            }
        } else {
            theme = DARK;
        }

        // Apply and save the resolved theme
        setTheme(theme, true);
    }

    // Set the theme
    function setTheme(theme, save = true) {
        document.documentElement.setAttribute('data-theme', theme);

        if (save) {
            localStorage.setItem(THEME_KEY, theme);
        }

        // Update any toggle buttons on the page
        updateToggleButtons(theme);

        // Update meta theme-color for mobile browsers
        updateMetaThemeColor(theme);
    }

    // Toggle between light and dark
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || LIGHT;
        const newTheme = currentTheme === DARK ? LIGHT : DARK;
        setTheme(newTheme);
        // Mark that the client manually chose a theme (overrides coach default)
        try { localStorage.setItem(USER_OVERRIDE_KEY, 'true'); } catch {}
        return newTheme;
    }

    // Update all toggle buttons to reflect current state
    function updateToggleButtons(theme) {
        const toggles = document.querySelectorAll('.theme-toggle, [data-theme-toggle]');
        toggles.forEach(toggle => {
            toggle.setAttribute('aria-pressed', theme === DARK);
            toggle.setAttribute('title', theme === DARK ? 'Switch to light mode' : 'Switch to dark mode');
        });
    }

    // Update the meta theme-color tag
    function updateMetaThemeColor(theme) {
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.content = theme === DARK ? '#0f172a' : '#0d9488';
    }

    // Get current theme
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') || LIGHT;
    }

    // Listen for system theme changes
    // Note: We ignore system theme changes since we always save user preference on init
    // This prevents unexpected theme switches in PWA context where localStorage can be unreliable
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user explicitly hasn't set a preference AND localStorage is working
        try {
            const savedTheme = localStorage.getItem(THEME_KEY);
            // If there's any saved preference, don't auto-switch
            if (savedTheme) {
                return;
            }
            // No preference saved - but we default to dark anyway, so only switch if system is dark
            if (e.matches) {
                setTheme(DARK, true);
            }
            // If system goes to light, we still stay dark (user hasn't opted for light)
        } catch (err) {
            // localStorage not available, stay with current theme
            console.warn('Theme: localStorage not available');
        }
    });

    // Auto-attach click handlers to theme toggles
    function setupToggleListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.theme-toggle') || e.target.closest('[data-theme-toggle]')) {
                e.preventDefault();
                toggleTheme();
            }
        });
    }

    // Initialize immediately (before DOM ready) to prevent flash
    initTheme();

    // Setup listeners when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupToggleListeners);
    } else {
        setupToggleListeners();
    }

    // Expose API globally
    window.ZiqueTheme = {
        toggle: toggleTheme,
        set: setTheme,
        get: getTheme,
        DARK: DARK,
        LIGHT: LIGHT
    };

})();
