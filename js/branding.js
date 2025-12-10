/**
 * Branding Loader
 *
 * Loads and applies coach branding to client/coach portals.
 * Includes caching for performance.
 */

(function() {
    'use strict';

    // Default branding values
    const DEFAULT_BRANDING = {
        brand_name: 'Zique Fitness Nutrition',
        brand_primary_color: '#0d9488',
        brand_secondary_color: '#0284c7',
        brand_accent_color: '#10b981',
        brand_logo_url: null,
        brand_favicon_url: null
    };

    // Cache key and duration
    const CACHE_KEY = 'zique_branding';
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

    /**
     * Get cached branding or null if expired/missing
     */
    function getCachedBranding() {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (!cached) return null;

            const { branding, timestamp, coachId } = JSON.parse(cached);
            const now = Date.now();

            // Check if cache is expired
            if (now - timestamp > CACHE_DURATION) {
                sessionStorage.removeItem(CACHE_KEY);
                return null;
            }

            return { branding, coachId };
        } catch (e) {
            return null;
        }
    }

    /**
     * Cache branding data
     */
    function cacheBranding(branding, coachId) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                branding,
                coachId,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('Failed to cache branding:', e);
        }
    }

    /**
     * Clear branding cache
     */
    function clearBrandingCache() {
        sessionStorage.removeItem(CACHE_KEY);
    }

    /**
     * Fetch branding from API
     */
    async function fetchBranding(coachId) {
        try {
            const url = coachId
                ? `/.netlify/functions/get-coach-branding?coachId=${coachId}`
                : '/.netlify/functions/get-coach-branding';

            const headers = {};

            // Add auth header if we have a session
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`;
                }
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                throw new Error('Failed to fetch branding');
            }

            return await response.json();
        } catch (error) {
            console.warn('Error fetching branding:', error);
            return null;
        }
    }

    /**
     * Apply branding to the page
     */
    function applyBranding(branding) {
        if (!branding) return;

        const root = document.documentElement;

        // Apply color CSS variables
        if (branding.brand_primary_color) {
            root.style.setProperty('--brand-primary', branding.brand_primary_color);
            // Generate darker variant for hover states
            root.style.setProperty('--brand-primary-dark', darkenColor(branding.brand_primary_color, 10));
        }

        if (branding.brand_secondary_color) {
            root.style.setProperty('--brand-secondary', branding.brand_secondary_color);
        }

        if (branding.brand_accent_color) {
            root.style.setProperty('--brand-accent', branding.brand_accent_color);
        }

        // Update gradient
        if (branding.brand_primary_color && branding.brand_secondary_color) {
            root.style.setProperty(
                '--brand-gradient',
                `linear-gradient(135deg, ${branding.brand_primary_color} 0%, ${branding.brand_secondary_color} 100%)`
            );
        }

        // Update favicon
        if (branding.brand_favicon_url) {
            updateFavicon(branding.brand_favicon_url);
        }

        // Update page title with brand name
        if (branding.brand_name && document.title.includes('Zique')) {
            document.title = document.title.replace('Zique Fitness Nutrition', branding.brand_name);
            document.title = document.title.replace('Zique Fitness', branding.brand_name);
        }

        // Update meta theme-color
        if (branding.brand_primary_color) {
            let metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.content = branding.brand_primary_color;
            }
        }

        // Update logo elements if they exist
        updateLogoElements(branding);

        // Update brand name text elements
        updateBrandNameElements(branding);

        // Dispatch event for other scripts to react
        window.dispatchEvent(new CustomEvent('brandingLoaded', { detail: branding }));
    }

    /**
     * Update favicon
     */
    function updateFavicon(url) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = url;
    }

    /**
     * Update logo elements on the page
     */
    function updateLogoElements(branding) {
        // Update sidebar logo if it exists
        const sidebarLogo = document.querySelector('.sidebar-logo-img');
        if (sidebarLogo && branding.brand_logo_url) {
            sidebarLogo.src = branding.brand_logo_url;
            sidebarLogo.alt = branding.brand_name || 'Logo';
        }

        // Update any elements with data-brand-logo attribute
        document.querySelectorAll('[data-brand-logo]').forEach(el => {
            if (el.tagName === 'IMG' && branding.brand_logo_url) {
                el.src = branding.brand_logo_url;
            }
        });

        // Update header logo containers
        const headerLogos = document.querySelectorAll('.header-logo, .nav-logo');
        headerLogos.forEach(logo => {
            if (branding.brand_logo_url) {
                const img = logo.querySelector('img');
                if (img) {
                    img.src = branding.brand_logo_url;
                }
            }
        });
    }

    /**
     * Update brand name text elements
     */
    function updateBrandNameElements(branding) {
        if (!branding.brand_name) return;

        // Update elements with data-brand-name attribute
        document.querySelectorAll('[data-brand-name]').forEach(el => {
            el.textContent = branding.brand_name;
        });

        // Replace "Zique Fitness" text in specific elements
        const brandNameSelectors = [
            '.brand-name',
            '.logo-text',
            '.sidebar-brand-name'
        ];

        brandNameSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el.textContent.includes('Zique')) {
                    el.textContent = branding.brand_name;
                }
            });
        });
    }

    /**
     * Darken a hex color by a percentage
     */
    function darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    /**
     * Initialize branding
     */
    async function initBranding(coachId = null) {
        // Check cache first
        const cached = getCachedBranding();
        if (cached && (!coachId || cached.coachId === coachId)) {
            applyBranding(cached.branding);
            return cached.branding;
        }

        // Fetch fresh branding
        const branding = await fetchBranding(coachId);

        if (branding && branding.has_branding_access) {
            cacheBranding(branding, branding.coach_id);
            applyBranding(branding);
            return branding;
        }

        // Fall back to defaults
        applyBranding(DEFAULT_BRANDING);
        return DEFAULT_BRANDING;
    }

    /**
     * Get current branding (sync, from cache only)
     */
    function getCurrentBranding() {
        const cached = getCachedBranding();
        return cached?.branding || DEFAULT_BRANDING;
    }

    // Expose API
    window.ZiqueBranding = {
        init: initBranding,
        apply: applyBranding,
        getCurrent: getCurrentBranding,
        clearCache: clearBrandingCache,
        defaults: DEFAULT_BRANDING
    };

    // Auto-initialize on DOM ready if coachId is available
    document.addEventListener('DOMContentLoaded', function() {
        // Check if we're on a client page with coach context
        const coachIdMeta = document.querySelector('meta[name="coach-id"]');
        if (coachIdMeta) {
            initBranding(coachIdMeta.content);
        }

        // Or check URL params
        const urlParams = new URLSearchParams(window.location.search);
        const coachIdParam = urlParams.get('coachId');
        if (coachIdParam) {
            initBranding(coachIdParam);
        }
    });

})();
