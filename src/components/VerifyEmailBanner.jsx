import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../utils/api';

// Per-client key so a dismiss on one account doesn't hide the nag on another
// (shared devices). Falls back to a generic key if we somehow have no id.
const dismissKey = (clientData) =>
  `zq_verify_banner_dismissed_${clientData?.id || clientData?.email || 'anon'}`;

/**
 * Nag banner for clients who self-signed-up via a gym join code
 * (gym-join.js) and haven't clicked the confirmation link yet. Coach-added
 * / invited clients are auto-verified at creation and never see this — see
 * email_verified_at on the clients table.
 *
 * Intentionally non-blocking: the client can keep using the app while
 * unverified (founder's call — friction-free signup, verify later).
 */
function VerifyEmailBanner() {
  const { clientData } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey(clientData)) === '1'; }
    catch { return false; }
  });

  if (clientData?.is_coach) return null;
  if (!clientData || clientData.email_verified_at) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(dismissKey(clientData), '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleResend = async () => {
    setStatus('sending');
    try {
      const res = await apiPost('/.netlify/functions/resend-client-verification-email', {});
      if (res?.alreadyVerified) {
        // Stale client cache — a page refresh will pick up the verified state.
        setStatus('sent');
      } else {
        setStatus('sent');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        background: '#fef3c7',
        color: '#92400e',
        fontSize: '13.5px',
        lineHeight: 1.4,
        flexWrap: 'wrap'
      }}
    >
      <Mail size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: '1 1 200px' }}>
        {status === 'sent'
          ? `We sent a new confirmation link to ${clientData.email || 'your email'}.`
          : `Please confirm your email (${clientData.email || 'on file'}) so you don't lose access to your account.`}
      </span>
      {status !== 'sent' && (
        <button
          onClick={handleResend}
          disabled={status === 'sending'}
          style={{
            background: 'none',
            border: '1px solid #92400e',
            borderRadius: '6px',
            padding: '4px 10px',
            color: '#92400e',
            fontSize: '13px',
            fontWeight: 600,
            cursor: status === 'sending' ? 'default' : 'pointer',
            opacity: status === 'sending' ? 0.6 : 1,
            flexShrink: 0
          }}
        >
          {status === 'sending' ? 'Sending…' : status === 'error' ? 'Try again' : 'Resend email'}
        </button>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          margin: '-4px -4px -4px 0',
          color: '#92400e',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default VerifyEmailBanner;
