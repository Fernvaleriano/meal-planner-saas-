import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { seedBrandingCache, applyPWAIdentity } from '../context/BrandingContext';

const DEFAULT_LOGO = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';
const DEFAULT_PRIMARY = '#2cb5a5';

/**
 * Try to load coach branding for the login page.
 * Sources: URL ?coachId= param, or localStorage from previous session.
 *
 * NOTE: This intentionally does NOT persist coachIdParam to localStorage.
 * Writing it here would let any unauthenticated visit to
 * /app/login?coachId=X overwrite the stored login_coach_id, including
 * with arbitrary / non-existent ids — which would then re-brand the
 * login screen for the real user on next visit. Persistence happens
 * only after a successful sign-in (see handleLogin below).
 */
function getLoginBranding(coachIdParam) {
  const coachId = coachIdParam || localStorage.getItem('login_coach_id');
  if (!coachId) return null;

  try {
    const cached = localStorage.getItem(`coach_branding_v2_${coachId}`);
    if (cached) {
      const { data } = JSON.parse(cached);
      if (data) return data;
    }
  } catch { /* ignore */ }

  return { coach_id: coachId };
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, refreshClientData } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();

  const coachIdParam = searchParams.get('coachId');
  const emailVerified = searchParams.get('emailVerified') === '1';
  const verifyError = searchParams.get('verifyError');
  const [brandingData, setBrandingData] = useState(() => getLoginBranding(coachIdParam));
  const [logoFailed, setLogoFailed] = useState(false);
  // Whether this device is associated with a coach (invite link or a previous
  // login). If so, we hold back the platform's default logo while the coach's
  // real branding loads — a neutral beat beats flashing the wrong brand.
  const [hasCoachContext] = useState(() => {
    try {
      return !!(coachIdParam || localStorage.getItem('login_coach_id'));
    } catch {
      return !!coachIdParam;
    }
  });
  // First-visit brand gate. When we know a gym is involved (coach context) but
  // its colors haven't resolved yet, we show a neutral loading ring instead of
  // the login form painted in the default-teal fallback — otherwise the button
  // flashes teal for a beat and then swaps to the gym's real color. This flips
  // true only if branding is slow/unreachable, so the form is still revealed
  // (with defaults) rather than leaving anyone stuck on the ring.
  const [brandGateTimedOut, setBrandGateTimedOut] = useState(false);

  // Fetch branding from API if we have a coach ID but no cached data
  useEffect(() => {
    const coachId = coachIdParam || localStorage.getItem('login_coach_id');
    if (!coachId) return;
    if (brandingData?.brand_name && brandingData.brand_name !== 'Ziquecoach') return;

    fetch(`/.netlify/functions/get-coach-branding?coachId=${coachId}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setBrandingData(data);
          try {
            localStorage.setItem(`coach_branding_v2_${coachId}`, JSON.stringify({
              data,
              timestamp: Date.now(),
            }));
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* use defaults */ });
  }, [coachIdParam]);

  // Stamp the PWA home-screen identity as soon as we know which gym this
  // login page belongs to. A client who lands on a branded login link and
  // saves to their home screen BEFORE ever signing in should get the gym's
  // name + icon, not the Ziquecoach defaults.
  useEffect(() => {
    if (brandingData?.coach_id) applyPWAIdentity(brandingData);
  }, [brandingData]);

  // Redirect if already logged in. Arriving here with ?emailVerified=1 means
  // the session was already active when the confirmation link was tapped
  // (e.g. same device, still signed in) — the normal SIGNED_IN listener that
  // refreshes clientData never fires in that case, so the "confirm your
  // email" banner would otherwise keep showing stale (pre-confirmation)
  // data forever. Force one refetch before bouncing back in.
  useEffect(() => {
    if (user) {
      // Returning from a Google sign-in: resolve WHO this login is first
      // (links a pending invite by email server-side). A Google login with
      // no account gets signed out with a clear message; coaches/trainers
      // are sent to the coach app instead of the client app.
      if (localStorage.getItem('zq_oauth_pending_app')) {
        localStorage.removeItem('zq_oauth_pending_app');
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/.netlify/functions/oauth-bootstrap', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
              },
              body: JSON.stringify({})
            });
            const info = res.ok ? await res.json() : null;
            if (info?.role === 'client') {
              await refreshClientData();
              navigate('/', { replace: true });
              return;
            }
            if (info?.role === 'coach' || info?.role === 'trainer') {
              window.location.href = '/dashboard.html';
              return;
            }
            await supabase.auth.signOut();
            setError('No account found for that Google email. Ask your coach for an invite link first.');
          } catch {
            // Resolution hiccup — proceed like a normal login.
            navigate('/', { replace: true });
          }
        })();
        return;
      }
      if (emailVerified) refreshClientData();
      navigate('/', { replace: true });
    }
  }, [user, navigate, emailVerified, refreshClientData]);

  const handleGoogleLogin = async () => {
    setError('');
    try {
      localStorage.setItem('zq_oauth_pending_app', '1');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/app/login` }
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      localStorage.removeItem('zq_oauth_pending_app');
      setError(err.message || 'Google sign-in failed. Please try again.');
    }
  };

  // A fresh logo URL (e.g. after the branding fetch resolves) gets a fresh
  // chance to load even if a previous URL failed
  useEffect(() => {
    setLogoFailed(false);
  }, [brandingData?.brand_logo_url]);

  // Safety valve for the first-visit brand gate: if the gym's colors don't
  // arrive within a few seconds (slow or failed network), reveal the form
  // anyway with the defaults rather than spinning forever.
  useEffect(() => {
    const known = !!(brandingData?.brand_logo_url || brandingData?.brand_primary_color);
    if (!hasCoachContext || known) return;
    const id = setTimeout(() => setBrandGateTimedOut(true), 3000);
    return () => clearTimeout(id);
  }, [hasCoachContext, brandingData?.brand_logo_url, brandingData?.brand_primary_color]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password
      });

      if (authError) throw authError;

      // Check if user is a client
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', data.user.id)
        .single();

      if (clientError || !client) {
        await supabase.auth.signOut();
        throw new Error(t('login.notRegistered'));
      }

      // Now that auth + client lookup both succeeded, it's safe to remember
      // the coach for next time. Prefer the client's REAL coach_id over the
      // URL param — it brands future logins even when the client arrives
      // without an invite link, and can't be spoofed by a query string.
      const realCoachId = client.coach_id || coachIdParam;
      if (realCoachId) {
        try { localStorage.setItem('login_coach_id', realCoachId); } catch { /* ignore */ }
      }

      // Seed the app's branding cache so the very first post-login boot is
      // already in the coach's colors (no default-teal flash on a brand-new
      // device). Only when the branding we fetched is actually this client's
      // coach — a mismatched invite link must not paint another coach's brand.
      if (brandingData?.brand_primary_color && brandingData?.coach_id
          && (!client.coach_id || brandingData.coach_id === client.coach_id)) {
        seedBrandingCache(brandingData.coach_id, brandingData);
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('login.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Resolve branding values
  const brandKnown = !!(brandingData?.brand_logo_url || brandingData?.brand_primary_color);
  // Hold the branded login behind a neutral ring until the gym's colors are
  // known (or the timeout above gives up). Never gates the plain Ziquecoach
  // login — with no coach context there's nothing to wait for.
  const brandLoading = hasCoachContext && !brandKnown && !brandGateTimedOut;
  // With a coach context but branding still loading, show no logo instead of
  // the platform default (which would flash and then swap to the coach's).
  const logoUrl = brandingData?.brand_logo_url || (hasCoachContext && !brandKnown ? null : DEFAULT_LOGO);
  const primaryColor = brandingData?.brand_primary_color || DEFAULT_PRIMARY;
  const brandName = brandingData?.brand_name || 'Ziquecoach';
  const welcomeMessage = brandingData?.brand_welcome_message;
  const hasCustomBranding = brandingData?.brand_logo_url || (brandingData?.brand_name && brandingData.brand_name !== 'Ziquecoach');

  return (
    <div className="login-page">
      <div className="login-container">
        {brandLoading ? (
          <div className="login-brand-loading" role="status" aria-live="polite">
            <div className="brand-ring"></div>
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
        <>
        {/* Logo (fixed-height slot so a late-loading logo doesn't shift the form) */}
        <div className="login-logo">
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt={brandName}
              onError={() => setLogoFailed(true)}
              style={hasCustomBranding && brandingData?.brand_logo_url ? { borderRadius: '12px', objectFit: 'contain' } : undefined}
            />
          ) : logoFailed ? (
            <div className="login-logo-fallback">{brandName}</div>
          ) : null}
        </div>

        {/* Header */}
        <div className="login-header">
          <h1>{welcomeMessage || t('login.welcomeBack')}</h1>
          <p>{hasCustomBranding ? t('login.signInTo', { brand: brandName }) : t('login.signInPortal')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          {!error && emailVerified && (
            <div className="login-error" style={{ background: '#dcfce7', color: '#166534' }}>
              Email confirmed! Log in to continue.
            </div>
          )}

          {!error && verifyError && (
            <div className="login-error">
              {verifyError === 'expired'
                ? 'That confirmation link expired. Log in, then use "Resend email" in the banner.'
                : 'That confirmation link is invalid. Log in, then use "Resend email" in the banner.'}
            </div>
          )}

          <div className="login-field">
            <label>{t('login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              required
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>

          <div className="login-field">
            <label>{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner"></span>
                {t('login.signingIn')}
              </>
            ) : (
              t('login.signIn')
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }}></div>
            or
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }}></div>
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: 12,
              background: 'white', fontFamily: 'inherit', fontSize: '0.95rem',
              fontWeight: 600, color: '#334155', cursor: 'pointer'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continue with Google
          </button>

          <div className="forgot-password-link">
            <Link to="/forgot-password">{t('login.forgot')}</Link>
          </div>
        </form>

        {/* Back to role selection */}
        <div className="login-back-link">
          <a href="/login-select.html">{t('login.notClient')}</a>
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p>{hasCustomBranding ? t('login.poweredBy', { brand: brandName }) : t('login.poweredByDefault')}</p>
        </div>
        </>
        )}
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          padding: 20px;
        }

        .login-container {
          width: 100%;
          max-width: 380px;
          padding: 40px 32px;
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .login-logo {
          text-align: center;
          margin-bottom: 32px;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-logo img {
          height: 80px;
          width: auto;
          max-width: 200px;
        }

        .login-logo-fallback {
          color: #f1f5f9;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-header h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 8px;
        }

        .login-header p {
          color: #94a3b8;
          font-size: 0.95rem;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 14px 16px;
          border-radius: 12px;
          font-size: 0.9rem;
          text-align: center;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .login-field label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #94a3b8;
        }

        .login-field input {
          width: 100%;
          padding: 16px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          color: #f1f5f9;
          font-size: 1rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .login-field input::placeholder {
          color: #64748b;
        }

        .login-field input:focus {
          outline: none;
          border-color: ${primaryColor};
          background: rgba(15, 23, 42, 0.8);
          box-shadow: 0 0 0 3px ${primaryColor}33;
        }

        .login-button {
          width: 100%;
          padding: 16px;
          margin-top: 8px;
          background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 14px ${primaryColor}66;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px ${primaryColor}80;
        }

        .login-button:active:not(:disabled) {
          transform: scale(0.98);
        }

        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Neutral loading ring shown on a branded login while the gym's colors
           resolve — deliberately brand-agnostic (white on the dark card) so it
           never has to flash from one color to another. */
        .login-brand-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 340px;
        }

        .brand-ring {
          width: 54px;
          height: 54px;
          border: 4px solid rgba(255, 255, 255, 0.14);
          border-top-color: rgba(255, 255, 255, 0.85);
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .forgot-password-link {
          text-align: center;
          margin-top: 4px;
        }

        .forgot-password-link a {
          color: #94a3b8;
          font-size: 0.9rem;
          text-decoration: none;
          transition: color 0.2s;
        }

        .forgot-password-link a:hover {
          color: ${primaryColor};
        }

        .login-back-link {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(148, 163, 184, 0.2);
          text-align: center;
        }

        .login-back-link a {
          color: #94a3b8;
          font-size: 0.875rem;
          text-decoration: none;
          transition: color 0.2s;
        }

        .login-back-link a:hover {
          color: ${primaryColor};
        }

        .login-footer {
          margin-top: 32px;
          text-align: center;
        }

        .login-footer p {
          font-size: 0.8rem;
          color: #64748b;
        }

        /* Safe area for notched devices */
        @supports (padding: env(safe-area-inset-bottom)) {
          .login-page {
            padding-bottom: calc(20px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}

export default Login;
