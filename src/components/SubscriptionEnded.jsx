import { useNavigate } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * Soft lock screen shown when the coach has set the client's
 * access_status to 'paused' (usually because a payment didn't go
 * through). Wording is payment-flavored and intentionally avoids
 * implying the coach personally cut the client off. Client can reach
 * /my-billing and /settings; everything else is hidden until the coach
 * resumes them.
 *
 * Colors: the card is always white (so the lock screen reads clearly
 * regardless of the client's light/dark theme), and the lock icon +
 * primary button pick up the coach's brand_primary_color so a branded
 * coach's lock screen still looks like their app. Title/body/secondary
 * colors are hard-coded dark so they don't follow `--gray-*` vars that
 * flip to white in dark mode — that's the white-on-white bug we hit.
 */
function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(44, 181, 165, ${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(44, 181, 165, ${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SubscriptionEnded() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { branding } = useBranding();
  const brandColor = branding?.brand_primary_color || '#2cb5a5';
  const iconBg = hexToRgba(brandColor, 0.15);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.iconWrap, background: iconBg }}>
          <Lock size={28} color={brandColor} />
        </div>
        <h2 style={styles.title}>{t('subscriptionEnded.title')}</h2>
        <p style={styles.body}>{t('subscriptionEnded.body')}</p>
        <button
          style={{ ...styles.primaryBtn, background: brandColor }}
          onClick={() => navigate('/my-billing')}
        >
          {t('subscriptionEnded.viewBilling')}
        </button>
        <button style={styles.secondaryBtn} onClick={logout}>
          <LogOut size={14} /> {t('subscriptionEnded.signOut')}
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
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px'
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 12px'
  },
  body: {
    fontSize: 15,
    lineHeight: 1.5,
    color: '#475569',
    margin: '0 0 28px'
  },
  primaryBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    color: 'white',
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
    color: '#64748b',
    fontSize: 13,
    cursor: 'pointer',
    padding: 8
  }
};
