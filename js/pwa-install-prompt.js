/**
 * PWA Install Prompt Handler
 * Shows a smart banner prompting users to install the app on their home screen
 * - Handles Chrome/Edge/Android with native beforeinstallprompt
 * - Shows iOS-specific instructions for Safari
 * - Remembers dismissal for 7 days
 * - Doesn't show if already installed as PWA
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'pwa_install_dismissed';
    const DISMISS_DAYS = 7;
    const SHOW_DELAY_MS = 3000; // Show after 3 seconds

    let deferredPrompt = null;
    let bannerElement = null;

    // Check if running in standalone mode (already installed)
    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    // Check if user dismissed the banner recently
    function isDismissed() {
        const dismissed = localStorage.getItem(STORAGE_KEY);
        if (!dismissed) return false;

        const dismissedTime = parseInt(dismissed, 10);
        const daysSince = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
        return daysSince < DISMISS_DAYS;
    }

    // Save dismissal
    function saveDismissal() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }

    // Detect iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Detect Safari on iOS
    function isIOSSafari() {
        return isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    }

    // Create and inject the banner HTML/CSS
    function createBanner() {
        // Inject styles
        const style = document.createElement('style');
        style.textContent = `
            .pwa-install-banner {
                position: fixed;
                bottom: 80px;
                left: 16px;
                right: 16px;
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                border-radius: 16px;
                padding: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
                z-index: 10000;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                transform: translateY(150%);
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
                max-width: 400px;
                margin: 0 auto;
            }

            .pwa-install-banner.show {
                transform: translateY(0);
                opacity: 1;
            }

            .pwa-install-banner-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }

            .pwa-install-icon {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .pwa-install-icon svg {
                width: 24px;
                height: 24px;
                color: white;
            }

            .pwa-install-text {
                flex: 1;
                min-width: 0;
            }

            .pwa-install-title {
                font-size: 15px;
                font-weight: 700;
                color: white;
                margin-bottom: 4px;
                line-height: 1.3;
            }

            .pwa-install-description {
                font-size: 13px;
                color: #94a3b8;
                line-height: 1.4;
                margin-bottom: 0;
            }

            .pwa-install-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }

            .pwa-install-btn {
                padding: 10px 16px;
                border-radius: 10px;
                border: none;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: inherit;
            }

            .pwa-install-btn-primary {
                background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
                color: white;
                flex: 1;
            }

            .pwa-install-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(13, 148, 136, 0.4);
            }

            .pwa-install-btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: #94a3b8;
            }

            .pwa-install-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
                color: white;
            }

            .pwa-install-close {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: none;
                background: rgba(255, 255, 255, 0.1);
                color: #64748b;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .pwa-install-close:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }

            .pwa-ios-steps {
                margin-top: 12px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
            }

            .pwa-ios-step {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 13px;
                color: #e2e8f0;
                padding: 6px 0;
            }

            .pwa-ios-step-num {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(13, 148, 136, 0.3);
                color: #0d9488;
                font-size: 11px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .pwa-ios-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                margin: 0 2px;
                vertical-align: middle;
            }

            @media (max-width: 480px) {
                .pwa-install-banner {
                    bottom: 70px;
                    left: 12px;
                    right: 12px;
                }
            }

            /* Dark mode adjustments - banner is already dark, so minimal changes needed */
            @media (prefers-color-scheme: dark) {
                .pwa-install-banner {
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
                }
            }
        `;
        document.head.appendChild(style);

        // Create banner element
        bannerElement = document.createElement('div');
        bannerElement.className = 'pwa-install-banner';
        bannerElement.id = 'pwaInstallBanner';

        document.body.appendChild(bannerElement);
    }

    // Show banner for Chrome/Android (with native install)
    function showNativeInstallBanner() {
        bannerElement.innerHTML = `
            <button class="pwa-install-close" onclick="window.dismissPWABanner()" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="pwa-install-banner-content">
                <div class="pwa-install-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <div class="pwa-install-text">
                    <div class="pwa-install-title">Install Zique Fitness</div>
                    <p class="pwa-install-description">Add to your home screen for quick access, offline support, and a native app experience.</p>
                </div>
            </div>
            <div class="pwa-install-actions">
                <button class="pwa-install-btn pwa-install-btn-secondary" onclick="window.dismissPWABanner()">Later</button>
                <button class="pwa-install-btn pwa-install-btn-primary" onclick="window.installPWA()">Install App</button>
            </div>
        `;

        requestAnimationFrame(() => {
            bannerElement.classList.add('show');
        });
    }

    // Show banner for iOS Safari (with instructions)
    function showIOSInstallBanner() {
        bannerElement.innerHTML = `
            <button class="pwa-install-close" onclick="window.dismissPWABanner()" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="pwa-install-banner-content">
                <div class="pwa-install-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                        <polyline points="16 6 12 2 8 6"></polyline>
                        <line x1="12" y1="2" x2="12" y2="15"></line>
                    </svg>
                </div>
                <div class="pwa-install-text">
                    <div class="pwa-install-title">Add to Home Screen</div>
                    <p class="pwa-install-description">Install this app on your iPhone for the best experience.</p>
                </div>
            </div>
            <div class="pwa-ios-steps">
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">1</span>
                    <span>Tap the <span class="pwa-ios-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> Share button</span>
                </div>
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">2</span>
                    <span>Scroll and tap <strong>"Add to Home Screen"</strong></span>
                </div>
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">3</span>
                    <span>Tap <strong>"Add"</strong> to confirm</span>
                </div>
            </div>
            <div class="pwa-install-actions">
                <button class="pwa-install-btn pwa-install-btn-primary" onclick="window.dismissPWABanner()" style="width: 100%;">Got it!</button>
            </div>
        `;

        requestAnimationFrame(() => {
            bannerElement.classList.add('show');
        });
    }

    // Install PWA (for Chrome/Android)
    window.installPWA = function() {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA installed');
            }
            deferredPrompt = null;
            hideBanner();
        });
    };

    // Dismiss banner
    window.dismissPWABanner = function() {
        saveDismissal();
        hideBanner();
    };

    // Hide banner with animation
    function hideBanner() {
        if (bannerElement) {
            bannerElement.classList.remove('show');
            setTimeout(() => {
                if (bannerElement && bannerElement.parentNode) {
                    bannerElement.parentNode.removeChild(bannerElement);
                    bannerElement = null;
                }
            }, 400);
        }
    }

    // Initialize
    function init() {
        // Don't show if already installed or recently dismissed
        if (isStandalone() || isDismissed()) {
            return;
        }

        createBanner();

        // Handle beforeinstallprompt for Chrome/Edge/Android
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;

            // Show banner after delay
            setTimeout(() => {
                showNativeInstallBanner();
            }, SHOW_DELAY_MS);
        });

        // For iOS Safari, show instructions after delay
        if (isIOSSafari()) {
            setTimeout(() => {
                showIOSInstallBanner();
            }, SHOW_DELAY_MS);
        }

        // Hide banner if app gets installed
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            hideBanner();
        });
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
