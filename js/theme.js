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

    // Initialize theme on page load (runs immediately)
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        const userOverride = localStorage.getItem(USER_OVERRIDE_KEY) === 'true';
        const coachTheme = localStorage.getItem(COACH_THEME_KEY);

        // Priority: user manual override > coach theme > saved preference > default dark
        let theme;
        if (userOverride && savedTheme) {
            // Client has manually toggled — respect their choice
            theme = savedTheme;
        } else if (coachTheme) {
            // Coach set a default theme for clients
            if (coachTheme === 'system') {
                theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
            } else {
                theme = coachTheme;
            }
        } else {
            theme = savedTheme || DARK;
        }

        // Always save the theme to ensure it persists (prevents system theme override)
        setTheme(theme, true);
    }

    // Set the theme
    function setTheme(theme, save = true) {
        document.documentElement.setAttribute('data-theme', theme);

        // Set background color immediately as inline style to prevent white flash
        // This takes effect before external CSS loads
        document.documentElement.style.backgroundColor = theme === DARK ? '#0f172a' : '#f8fafc';
        document.documentElement.style.colorScheme = theme === DARK ? 'dark' : 'light';

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

    // Inject a branded splash overlay to cover the white flash while CSS/JS loads
    function showSplashScreen() {
        var theme = document.documentElement.getAttribute('data-theme') || DARK;
        var bg = theme === DARK ? '#0f172a' : '#f8fafc';
        var spinnerColor = '#0d9488';

        // Inject splash styles and element before body renders
        var style = document.createElement('style');
        style.textContent =
            '#zique-splash{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;background:' + bg + ';transition:opacity 0.3s ease;}' +
            '#zique-splash.fade-out{opacity:0;pointer-events:none;}' +
            '#zique-splash-spinner{width:36px;height:36px;border:3px solid rgba(13,148,136,0.2);border-top-color:' + spinnerColor + ';border-radius:50%;animation:zq-spin 0.7s linear infinite;}' +
            '@keyframes zq-spin{to{transform:rotate(360deg)}}' +
            '#zique-splash-logo{width:48px;height:48px;margin-bottom:16px;border-radius:12px;}';
        document.head.appendChild(style);

        // Create splash element - will be added to body as soon as it exists
        function insertSplash() {
            if (document.getElementById('zique-splash')) return;
            var splash = document.createElement('div');
            splash.id = 'zique-splash';
            splash.innerHTML = '<img id="zique-splash-logo" src="/icons/logo.png" alt="" onerror="this.style.display=\'none\'">' +
                '<div id="zique-splash-spinner"></div>';
            document.body.insertBefore(splash, document.body.firstChild);
        }

        if (document.body) {
            insertSplash();
        } else {
            // body doesn't exist yet - wait for it
            document.addEventListener('DOMContentLoaded', insertSplash);
        }

        // Remove splash when page is fully loaded
        function removeSplash() {
            var splash = document.getElementById('zique-splash');
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(function() { splash.remove(); }, 300);
            }
        }

        // Remove on window load (all resources ready) or after 4s max
        window.addEventListener('load', removeSplash);
        setTimeout(removeSplash, 4000);
    }

    showSplashScreen();

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
