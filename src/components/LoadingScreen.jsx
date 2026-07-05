import { useEffect, useMemo, useState } from 'react';

// Neutral gray used when no coach brand is cached yet — never show the
// platform's default logo/teal to a client whose coach has their own brand.
const NEUTRAL_SPINNER = '#94a3b8';

/**
 * Get coach branding from cache. Two sources, in order:
 *   1. sessionStorage 'zique_branding' — written by applyBrandingCSS, current tab.
 *   2. localStorage 'zique_branding_preload' — the persistent cold-start snapshot
 *      the pre-React splash script also uses. Without this fallback a cold PWA
 *      relaunch (fresh sessionStorage) briefly showed the default logo even
 *      though the raw splash before it was already coach-branded.
 * Returns { logoUrl, primaryColor, brandName } or null.
 */
function getCachedBranding() {
  try {
    const cached = sessionStorage.getItem('zique_branding');
    if (cached) {
      const { branding } = JSON.parse(cached);
      if (branding) {
        return {
          logoUrl: branding.brand_logo_url || null,
          primaryColor: branding.brand_primary_color || null,
          brandName: branding.brand_name || null,
        };
      }
    }
  } catch { /* fall through to preload snapshot */ }
  try {
    const preloadRaw = localStorage.getItem('zique_branding_preload');
    if (preloadRaw) {
      const preload = JSON.parse(preloadRaw);
      if (preload && (preload.logo || preload.primary)) {
        return {
          logoUrl: preload.logo || null,
          primaryColor: preload.primary || null,
          brandName: preload.brandName || null,
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

function LoadingScreen() {
  const branding = useMemo(() => getCachedBranding(), []);
  // No cached brand → neutral splash (spinner only), matching the pre-React
  // splash in app-test.html. Wrong brand is worse than no brand.
  const logoUrl = branding?.logoUrl || null;
  const primaryColor = branding?.primaryColor || NEUTRAL_SPINNER;
  const brandName = branding?.brandName || '';
  const spinnerBorderColor = primaryColor + '33'; // 20% opacity
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => { setLogoFailed(false); }, [logoUrl]);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        {logoUrl && !logoFailed ? (
          <img
            src={logoUrl}
            alt={brandName}
            className="loading-logo"
            onError={() => setLogoFailed(true)}
          />
        ) : logoFailed && brandName ? (
          <div className="loading-logo-fallback">{brandName}</div>
        ) : null}
        <div className="loading-spinner-container">
          <div
            className="loading-spinner-ring"
            style={{
              borderColor: spinnerBorderColor,
              borderTopColor: primaryColor,
            }}
          />
        </div>
      </div>

      <style>{`
        .loading-screen {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .loading-logo {
          width: 100px;
          height: auto;
          animation: logoPulse 2s ease-in-out infinite;
        }

        .loading-logo-fallback {
          color: #fff;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-align: center;
          padding: 0 16px;
          animation: logoPulse 2s ease-in-out infinite;
        }

        @keyframes logoPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        .loading-spinner-container {
          position: relative;
          width: 40px;
          height: 40px;
        }

        .loading-spinner-ring {
          width: 40px;
          height: 40px;
          /* Neutral fallback — the inline style above paints the coach color */
          border: 3px solid rgba(148, 163, 184, 0.25);
          border-top-color: #94a3b8;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default LoadingScreen;
