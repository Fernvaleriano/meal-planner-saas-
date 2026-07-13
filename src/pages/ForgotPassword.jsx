import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useLanguage } from '../context/LanguageContext';

const DEFAULT_LOGO = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';
const DEFAULT_PRIMARY = '#2cb5a5';

/**
 * Coach branding for the forgot-password screen — same cached source the
 * Login page uses (login_coach_id is set after a successful sign-in, and the
 * per-coach cache is written by Login's branding fetch). Cache-only on
 * purpose: this page is always reached from Login, which fetches.
 */
function getForgotBranding() {
  try {
    const coachId = localStorage.getItem('login_coach_id');
    if (!coachId) return null;
    const cached = localStorage.getItem(`coach_branding_v2_${coachId}`);
    if (cached) {
      const { data } = JSON.parse(cached);
      if (data) return data;
    }
  } catch { /* ignore */ }
  return null;
}

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [branding] = useState(() => getForgotBranding());
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = branding?.brand_logo_url || DEFAULT_LOGO;
  const primaryColor = branding?.brand_primary_color || DEFAULT_PRIMARY;
  const brandName = branding?.brand_name || 'Ziquecoach';

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleanEmail = email.toLowerCase().trim();
    try {
      // Branded reset: the server looks up which coach this member belongs
      // to and sends the reset email in that coach's name/logo, with a link
      // that lands on the coach-branded set-password page. It always reports
      // success for a well-formed request, so nothing leaks about whether
      // the email exists.
      const res = await fetch('/.netlify/functions/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      if (!res.ok) throw new Error('branded-reset-failed');
      setSuccess(true);
    } catch {
      // Fall back to Supabase's built-in reset email (unbranded but
      // reliable) so a member is never left unable to reset at all.
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/set-password.html`
        });
        if (resetError) throw resetError;
        setSuccess(true);
      } catch (err) {
        setError(err.message || t('forgot.sendFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo */}
        <div className="login-logo">
          {!logoFailed ? (
            <img
              src={logoUrl}
              alt={brandName}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="login-logo-fallback">{brandName}</div>
          )}
        </div>

        {/* Header */}
        <div className="login-header">
          <h1>{t('forgot.title')}</h1>
          <p>{t('forgot.subtitle')}</p>
        </div>

        {/* Form */}
        {!success ? (
          <form onSubmit={handleResetPassword} className="login-form">
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="login-field">
              <label>{t('forgot.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('forgot.emailPlaceholder')}
                required
                autoComplete="email"
                autoCapitalize="none"
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
                  {t('forgot.sending')}
                </>
              ) : (
                t('forgot.sendLink')
              )}
            </button>

            <button
              type="button"
              className="back-link"
              onClick={() => navigate('/login')}
            >
              {t('forgot.backToSignIn')}
            </button>
          </form>
        ) : (
          <div className="success-message">
            <div className="success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2>{t('forgot.checkEmailTitle')}</h2>
            <p>{t('forgot.sentTo')} <strong>{email}</strong></p>
            <p className="note">{t('forgot.spamNote')}</p>
            <button
              type="button"
              className="login-button"
              onClick={() => navigate('/login')}
            >
              {t('forgot.backToSignIn')}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="login-footer">
          <p>{t('forgot.poweredBy', { brand: brandName })}</p>
        </div>
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
        }

        .login-logo img {
          height: 80px;
          width: auto;
          max-width: 200px;
          object-fit: contain;
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

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .back-link {
          width: 100%;
          padding: 14px;
          background: transparent;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 0.95rem;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-link:hover {
          border-color: rgba(148, 163, 184, 0.5);
          color: #f1f5f9;
        }

        .success-message {
          text-align: center;
        }

        .success-icon {
          color: #10b981;
          margin-bottom: 20px;
        }

        .success-message h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 12px;
        }

        .success-message p {
          color: #94a3b8;
          font-size: 0.95rem;
          margin-bottom: 8px;
        }

        .success-message p strong {
          color: #f1f5f9;
        }

        .success-message .note {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 24px;
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

export default ForgotPassword;
