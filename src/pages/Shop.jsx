import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShoppingBag, Tag, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet } from '../utils/api';

// Category filter buttons. Order matters — 'all' first. A filter button only
// appears if the gym actually has a drop in that category, so a clothing-only
// gym never shows a "Supplements" tab.
const CATEGORIES = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'clothing', labelKey: 'filterClothing' },
  { key: 'supplement', labelKey: 'filterSupplements' },
];

/**
 * Member-facing Shop / Drops page: clothing + supplement promotions the gym
 * posts for its members. Each drop can have a photo and a short video, and
 * links out to the gym's OWN store — there's no in-app checkout. The gym
 * manages the list; here it's read-only.
 */
export default function Shop() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { clientData } = useAuth();
  const coachId = clientData?.coach_id;
  const [drops, setDrops] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    let cancelled = false;
    apiGet(`/.netlify/functions/gym-drops?coachId=${coachId}`)
      .then((res) => { if (!cancelled) setDrops(Array.isArray(res?.drops) ? res.drops : []); })
      .catch(() => { if (!cancelled) setDrops([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coachId]);

  const list = useMemo(() => (Array.isArray(drops) ? drops : []), [drops]);

  // Only show filter buttons for categories that actually have drops, and only
  // if there's more than one category in play (otherwise a filter is pointless).
  const presentCats = useMemo(() => {
    const set = new Set(list.map((d) => (d.category || 'other')));
    return CATEGORIES.filter((c) => c.key === 'all' || set.has(c.key));
  }, [list]);
  const showFilters = presentCats.length > 2;

  const visible = useMemo(
    () => (filter === 'all' ? list : list.filter((d) => (d.category || 'other') === filter)),
    [list, filter]
  );

  const S = {
    content: { padding: '18px 16px calc(90px + env(safe-area-inset-bottom))' },
    filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    chip: (active) => ({
      padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
      border: '1px solid var(--border-primary, #e2e8f0)',
      background: active ? 'var(--brand-primary, #14b8a6)' : 'transparent',
      color: active ? 'var(--brand-on-primary, #fff)' : 'var(--text-secondary, #64748b)',
    }),
    card: {
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border-primary, #e2e8f0)',
      borderRadius: 16, overflow: 'hidden', marginBottom: 14,
    },
    media: { width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', background: 'rgba(148,163,184,0.14)' },
    body: { padding: '14px 16px 16px' },
    titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    title: { fontSize: 17, fontWeight: 800, color: 'var(--text-primary, #1e293b)', margin: 0 },
    price: { fontSize: 16, fontWeight: 800, color: 'var(--brand-primary, #14b8a6)', whiteSpace: 'nowrap' },
    desc: { fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: '6px 0 0', lineHeight: 1.45 },
    code: {
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
      fontSize: 12.5, fontWeight: 700, letterSpacing: '0.4px', color: 'var(--text-primary, #334155)',
      background: 'rgba(148,163,184,0.16)', border: '1px dashed var(--border-primary, #cbd5e1)',
      borderRadius: 8, padding: '6px 10px',
    },
    btn: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 14, width: '100%', padding: '13px 16px',
      background: 'var(--brand-gradient, linear-gradient(135deg, #2cb5a5 0%, #4ec5b7 100%))',
      color: 'var(--brand-on-primary, #fff)', border: 'none', borderRadius: 'var(--btn-radius, 12px)',
      fontSize: 15, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
    },
    empty: { textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', padding: '56px 24px' },
    emptyIcon: { opacity: 0.4, marginBottom: 14 },
  };

  return (
    <div>
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">{t('shopPage.title')}</h1>
      </div>

      <div style={S.content}>
        {showFilters && (
          <div style={S.filters}>
            {presentCats.map((c) => (
              <button key={c.key} style={S.chip(filter === c.key)} onClick={() => setFilter(c.key)}>
                {t(`shopPage.${c.labelKey}`)}
              </button>
            ))}
          </div>
        )}

        {loading ? null : visible.length === 0 ? (
          <div style={S.empty}>
            <ShoppingBag size={40} style={S.emptyIcon} />
            <div style={{ fontSize: 15 }}>{t('shopPage.empty')}</div>
          </div>
        ) : (
          visible.map((d) => {
            const href = (d.link_url || '').trim();
            const hasLink = !!href;
            const safeHref = href && !/^https?:\/\//i.test(href) ? `https://${href}` : href;
            return (
              <div key={d.id} style={S.card}>
                {d.video_url ? (
                  <video
                    src={d.video_url}
                    poster={d.image_url || undefined}
                    style={S.media}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : d.image_url ? (
                  <img src={d.image_url} alt={d.title} style={S.media} loading="lazy" />
                ) : null}
                <div style={S.body}>
                  <div style={S.titleRow}>
                    <h2 style={S.title}>{d.title}</h2>
                    {d.price ? <span style={S.price}>{d.price}</span> : null}
                  </div>
                  {d.description ? <p style={S.desc}>{d.description}</p> : null}
                  {d.discount_code ? (
                    <div><span style={S.code}><Tag size={13} /> {d.discount_code}</span></div>
                  ) : null}
                  {hasLink ? (
                    <a style={S.btn} href={safeHref} target="_blank" rel="noopener noreferrer">
                      {t('shopPage.shopNow')} <ExternalLink size={16} />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
