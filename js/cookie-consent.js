/**
 * Cookie Consent Banner for GDPR Compliance
 * Include this script on all pages to show cookie consent banner
 */

(function() {
    'use strict';

    const COOKIE_NAME = 'zique_cookie_consent';
    const COOKIE_EXPIRY_DAYS = 365;

    // Check if consent already given
    function hasConsent() {
        return document.cookie.split(';').some(item => item.trim().startsWith(COOKIE_NAME + '='));
    }

    // Get consent value
    function getConsent() {
        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
        return match ? match[2] : null;
    }

    // Set consent cookie
    function setConsent(value) {
        const date = new Date();
        date.setTime(date.getTime() + (COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
        document.cookie = `${COOKIE_NAME}=${value}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
    }

    // Create and show the banner
    function showBanner() {
        if (hasConsent()) return;

        const banner = document.createElement('div');
        banner.id = 'cookie-consent-banner';
        banner.innerHTML = `
            <div style="
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: #1a1a2e;
                color: #fff;
                padding: 16px 20px;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
            ">
                <div style="flex: 1; min-width: 280px; line-height: 1.5;">
                    <strong style="display: block; margin-bottom: 4px;">We value your privacy</strong>
                    We use cookies to enhance your experience, analyze site traffic, and for marketing purposes.
                    By clicking "Accept All", you consent to our use of cookies.
                    <a href="/privacy.html" style="color: #60a5fa; text-decoration: underline;">Privacy Policy</a>
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button id="cookie-reject" style="
                        padding: 10px 20px;
                        border: 1px solid #fff;
                        background: transparent;
                        color: #fff;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                        font-size: 14px;
                        transition: all 0.2s;
                    ">Essential Only</button>
                    <button id="cookie-accept" style="
                        padding: 10px 24px;
                        border: none;
                        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                        color: #fff;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.2s;
                    ">Accept All</button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);

        // Add hover effects
        const acceptBtn = document.getElementById('cookie-accept');
        const rejectBtn = document.getElementById('cookie-reject');

        acceptBtn.addEventListener('mouseover', () => {
            acceptBtn.style.transform = 'translateY(-2px)';
            acceptBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
        });
        acceptBtn.addEventListener('mouseout', () => {
            acceptBtn.style.transform = 'translateY(0)';
            acceptBtn.style.boxShadow = 'none';
        });

        rejectBtn.addEventListener('mouseover', () => {
            rejectBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        rejectBtn.addEventListener('mouseout', () => {
            rejectBtn.style.background = 'transparent';
        });

        // Handle button clicks
        acceptBtn.addEventListener('click', () => {
            setConsent('all');
            hideBanner();
            // Enable analytics if configured
            if (typeof window.enableAnalytics === 'function') {
                window.enableAnalytics();
            }
        });

        rejectBtn.addEventListener('click', () => {
            setConsent('essential');
            hideBanner();
        });
    }

    // Hide the banner
    function hideBanner() {
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) {
            banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            banner.style.transform = 'translateY(100%)';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showBanner);
    } else {
        showBanner();
    }

    // Expose functions globally for manual control
    window.cookieConsent = {
        hasConsent,
        getConsent,
        setConsent,
        showBanner,
        hideBanner
    };
})();
