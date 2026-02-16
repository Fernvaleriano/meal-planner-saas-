import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Send password reset email via Supabase directly
      // No pre-check against clients table — RLS blocks anonymous reads,
      // and skipping the check avoids leaking whether an email exists
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/set-password.html`
      });

      if (resetError) throw resetError;

      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo */}
        <div className="login-logo">
          <img
            src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg"
            alt="Zique Fitness"
          />
        </div>

        {/* Header */}
        <div className="login-header">
          <h1>Reset Password</h1>
          <p>Enter your email to receive a reset link</p>
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
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
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
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>

            <button
              type="button"
              className="back-link"
              onClick={() => navigate('/login')}
            >
              Back to Sign In
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
            <h2>Check Your Email</h2>
            <p>We've sent a password reset link to <strong>{email}</strong></p>
            <p className="note">Don't forget to check your spam folder if you don't see it.</p>
            <button
              type="button"
              className="login-button"
              onClick={() => navigate('/login')}
            >
              Back to Sign In
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="login-footer">
          <p>Powered by Zique Fitness</p>
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
          border-color: #0d9488;
          background: rgba(15, 23, 42, 0.8);
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.2);
        }

        .login-button {
          width: 100%;
          padding: 16px;
          margin-top: 8px;
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
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
          box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(13, 148, 136, 0.5);
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
