import { useNavigate } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Soft lock screen shown when the coach has set the client's
 * access_status to 'paused' (usually because a payment didn't go
 * through). Wording is payment-flavored and intentionally avoids
 * implying the coach personally cut the client off. Client can reach
 * /my-billing and /settings; everything else is hidden until the coach
 * resumes them.
 */
export default function SubscriptionEnded() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <Lock size={28} color="#3730a3" />
        </div>
        <h2 style={styles.title}>Your account is on hold</h2>
        <p style={styles.body}>
          We weren't able to confirm your latest payment, so access to
          your workouts, meals, messages, and check-ins is paused.
          Please reach out to your coach to get reconnected.
        </p>
        <button
          style={styles.primaryBtn}
          onClick={() => navigate('/my-billing')}
        >
          View Billing
        </button>
        <button style={styles.secondaryBtn} onClick={logout}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--gray-50, #f8fafc)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '40px 28px',
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)'
  },
  iconWrap: {
    width: 64,
    height: 64,
    background: '#e0e7ff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px'
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--gray-900, #0f172a)',
    margin: '0 0 12px'
  },
  body: {
    fontSize: 15,
    lineHeight: 1.5,
    color: 'var(--gray-600, #475569)',
    margin: '0 0 28px'
  },
  primaryBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    color: 'white',
    background: 'var(--brand-primary, #ec4899)',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    marginBottom: 12
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    color: 'var(--gray-500, #64748b)',
    fontSize: 13,
    cursor: 'pointer',
    padding: 8
  }
};
