import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { apiGet } from '../utils/api';

/**
 * Home-screen banner for the newest gym "drop" (clothing / supplement promo).
 * Fully self-contained: it renders nothing unless the gym has the Shop module
 * enabled AND has at least one active drop, so it's safe to drop into any home
 * layout without extra guards. Tapping it opens the Shop tab.
 */
export default function DropsBanner() {
  const { clientData } = useAuth();
  const { isModuleVisible } = useBranding();
  const coachId = clientData?.coach_id;
  const shopOn = isModuleVisible('shop');
  const [drop, setDrop] = useState(null);

  useEffect(() => {
    if (!coachId || !shopOn) { setDrop(null); return; }
    let cancelled = false;
    apiGet(`/.netlify/functions/gym-drops?coachId=${coachId}`)
      .then((res) => {
        const drops = Array.isArray(res?.drops) ? res.drops : [];
        if (!cancelled) setDrop(drops[0] || null);
      })
      .catch(() => { if (!cancelled) setDrop(null); });
    return () => { cancelled = true; };
  }, [coachId, shopOn]);

  if (!shopOn || !drop) return null;

  const S = {
    link: {
      display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--brand-tile-border, rgba(148,163,184,0.28))',
      borderRadius: 16, padding: 10, marginBottom: 14,
    },
    thumb: {
      width: 56, height: 56, borderRadius: 12, flexShrink: 0, objectFit: 'cover',
      background: 'var(--brand-tile-bg-dark, rgba(148,163,184,0.16))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--brand-tile-icon-color, var(--brand-primary, #14b8a6))',
    },
    kicker: {
      fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase',
      color: 'var(--brand-tile-icon-color, var(--brand-primary, #14b8a6))',
    },
    title: { fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary, #1e293b)', marginTop: 1 },
    price: { fontSize: 13, color: 'var(--text-secondary, #64748b)', marginTop: 1 },
  };

  return (
    <Link to="/shop" style={S.link} aria-label={`New drop: ${drop.title}`}>
      {drop.image_url ? (
        <img src={drop.image_url} alt="" aria-hidden="true" style={S.thumb} />
      ) : (
        <div style={S.thumb}><ShoppingBag size={24} /></div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.kicker}>New Drop</div>
        <div style={S.title}>{drop.title}</div>
        {drop.price ? <div style={S.price}>{drop.price}</div> : null}
      </div>
      <ChevronRight size={22} style={{ opacity: 0.5, flexShrink: 0 }} />
    </Link>
  );
}
