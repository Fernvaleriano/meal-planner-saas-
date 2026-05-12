import { useNavigate } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Soft lock screen shown to clients whose subscription has fully ended
 * (no row, or row in 'canceled' status). They can resubscribe from
 * /my-billing, or sign out. Everything else in the app is hidden until
 * billing is restored.
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
        <h2 style={styles.title}>Your subscription has ended</h2>
        <p style={styles.body}>
          Your coaching plan is no longer active. Resubscribe to keep
          accessing workouts, meals, messages, and check-ins with your coach.
        </p>
        <button
          style={styles.primaryBtn}
          onClick={() => navigate('/my-billing')}
        >
          Choose a Plan
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
