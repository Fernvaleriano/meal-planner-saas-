/**
 * Zique Fitness Nutrition - Dark Mode Theme Manager
 * Handles theme switching and persistence
 */

(function() {
    'use strict';

    const THEME_KEY = 'zique-theme';
    const DARK = 'dark';
    const LIGHT = 'light';

    // Initialize theme on page load (runs immediately)
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Priority: saved preference > system preference > light
        const theme = savedTheme || (prefersDark ? DARK : LIGHT);
        setTheme(theme, false);
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
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        if (!localStorage.getItem(THEME_KEY)) {
            setTheme(e.matches ? DARK : LIGHT, false);
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
