import { useMemo } from 'react';

const DEFAULT_LOGO = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg';
const DEFAULT_PRIMARY = '#0d9488';

/**
 * Get coach branding from sessionStorage cache (set by branding.js or the SPA).
 * Returns { logoUrl, primaryColor } or defaults.
 */
function getCachedBranding() {
  try {
    const cached = sessionStorage.getItem('zique_branding');
    if (!cached) return null;
    const { branding } = JSON.parse(cached);
    if (!branding) return null;
    return {
      logoUrl: branding.brand_logo_url || null,
      primaryColor: branding.brand_primary_color || null,
    };
  } catch {
    return null;
  }
}

function LoadingScreen() {
  const branding = useMemo(() => getCachedBranding(), []);
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO;
  const primaryColor = branding?.primaryColor || DEFAULT_PRIMARY;
  const spinnerBorderColor = primaryColor + '33'; // 20% opacity

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <img
          src={logoUrl}
          alt="Loading"
          className="loading-logo"
        />
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
          border: 3px solid rgba(13, 148, 136, 0.2);
          border-top-color: #0d9488;
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
