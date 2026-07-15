import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, Calendar, MapPin, Phone, Instagram, Globe, Tag, Dumbbell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet } from '../utils/api';

// [day key, translation key]. Day labels are looked up via t('gymInfoPage.<key>').
const DAYS = [
  ['mon', 'dayMon'], ['tue', 'dayTue'], ['wed', 'dayWed'],
  ['thu', 'dayThu'], ['fri', 'dayFri'], ['sat', 'daySat'], ['sun', 'daySun']
];

function fmtTime(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || '';
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Member-facing gym info page: hours of operation, member classes and socials.
 * The coach edits this on their dashboard; here it's read-only. Reached from a
 * "Gym Info" tile on the home screen.
 */
export default function GymInfo() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { clientData } = useAuth();
  const coachId = clientData?.coach_id;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    let cancelled = false;
    apiGet(`/.netlify/functions/get-gym-info?coachId=${coachId}`)
      .then((res) => { if (!cancelled) setInfo(res && res.gym_info ? res.gym_info : null); })
      .catch(() => { /* leave empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coachId]);

  const hours = (info && info.hours) || {};
  const dayCells = DAYS.map(([k]) => hours[k]).filter(Boolean);
  const hasHours = dayCells.length > 0;
  const allOpen = hasHours && dayCells.every((d) => d && !d.closed);
  const first = hours.mon || dayCells[0];
  const identical = allOpen && first && dayCells.every((d) => d.open === first.open && d.close === first.close);

  const classes = info && Array.isArray(info.classes)
    ? info.classes.filter((c) => c && c.name && c.name.trim()) : [];

  const packages = info && Array.isArray(info.packages)
    ? info.packages.filter((p) => p && p.label && p.label.trim()) : [];

  const amenities = info && Array.isArray(info.amenities)
    ? info.amenities.filter((a) => a && String(a).trim()) : [];

  const instagram = ((info && info.instagram) || '').trim();
  const igHandle = instagram.replace(/^@/, '');
  const phone = ((info && info.phone) || '').trim();
  const website = ((info && info.website) || '').trim();
  const websiteHref = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  const address = ((info && info.address) || '').trim();
  const hasSocials = instagram || phone || website || address;
  const isEmpty = !hasHours && !classes.length && !packages.length && !amenities.length && !hasSocials;

  const S = {
    content: { padding: '18px 16px calc(90px + env(safe-area-inset-bottom))' },
    block: {
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border-primary, #e2e8f0)',
      borderRadius: 16,
      padding: '16px 18px',
      marginBottom: 14,
    },
    label: {
      display: 'flex', alignItems: 'center', gap: 7,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase',
      color: 'var(--text-secondary, #94a3b8)', marginBottom: 12,
    },
    hoursAll: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #334155)' },
    hoursRow: {
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', fontSize: 15, color: 'var(--text-primary, #334155)',
      borderBottom: '1px dashed var(--border-primary, #f1f5f9)',
    },
    day: { fontWeight: 700 },
    closed: { color: 'var(--text-secondary, #cbd5e1)' },
    cls: {
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 0', fontSize: 15, color: 'var(--text-primary, #334155)',
      borderBottom: '1px dashed var(--border-primary, #f1f5f9)',
    },
    cname: { fontWeight: 700 },
    csched: { color: 'var(--text-secondary, #64748b)', fontSize: 14 },
    free: {
      fontSize: 11, fontWeight: 700, color: '#059669',
      background: 'rgba(5,150,105,0.12)', borderRadius: 6, padding: '3px 9px',
    },
    pkg: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 0', fontSize: 15, color: 'var(--text-primary, #334155)',
      borderBottom: '1px dashed var(--border-primary, #f1f5f9)',
    },
    plabel: { fontWeight: 700 },
    pprice: { fontWeight: 800, color: 'var(--brand-primary, #14b8a6)', whiteSpace: 'nowrap' },
    amenities: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    amenity: {
      fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #334155)',
      background: 'var(--bg-subtle, #f1f5f9)', borderRadius: 8, padding: '6px 12px',
    },
    social: {
      display: 'flex', alignItems: 'center', gap: 9,
      fontSize: 15, color: 'var(--text-primary, #334155)', padding: '8px 0',
    },
    link: { color: 'var(--brand-primary, #14b8a6)', textDecoration: 'none', fontWeight: 600 },
    empty: { textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', padding: '48px 20px', fontSize: 15 },
  };

  const lastRow = { borderBottom: 'none' };

  return (
    <div>
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">{t('gymInfoPage.title')}</h1>
      </div>

      <div style={S.content}>
        {loading ? null : isEmpty ? (
          <div style={S.empty}>{t('gymInfoPage.empty')}</div>
        ) : (
          <>
            {hasHours && (
              <div style={S.block}>
                <div style={S.label}><Clock size={14} /> {t('gymInfoPage.hoursLabel')}</div>
                {identical ? (
                  <div style={S.hoursAll}>{t('gymInfoPage.openDaily')} · {fmtTime(first.open)} – {fmtTime(first.close)}</div>
                ) : (
                  DAYS.map(([k, nameKey], i) => {
                    const d = hours[k];
                    if (!d) return null;
                    return (
                      <div key={k} style={i === DAYS.length - 1 ? { ...S.hoursRow, ...lastRow } : S.hoursRow}>
                        <span style={S.day}>{t(`gymInfoPage.${nameKey}`)}</span>
                        <span>{d.closed ? <span style={S.closed}>{t('gymInfoPage.closed')}</span> : `${fmtTime(d.open)} – ${fmtTime(d.close)}`}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {classes.length > 0 && (
              <div style={S.block}>
                <div style={S.label}><Calendar size={14} /> {t('gymInfoPage.classesLabel')}</div>
                {classes.map((c, i) => (
                  <div key={i} style={i === classes.length - 1 ? { ...S.cls, ...lastRow } : S.cls}>
                    <span style={S.cname}>{c.name}</span>
                    {c.schedule ? <span style={S.csched}>{c.schedule}</span> : null}
                    {c.included ? <span style={S.free}>{t('gymInfoPage.freeWithMembership')}</span> : null}
                  </div>
                ))}
              </div>
            )}

            {packages.length > 0 && (
              <div style={S.block}>
                <div style={S.label}><Tag size={14} /> {t('gymInfoPage.packagesLabel')}</div>
                {packages.map((p, i) => (
                  <div key={i} style={i === packages.length - 1 ? { ...S.pkg, ...lastRow } : S.pkg}>
                    <span style={S.plabel}>{p.label}</span>
                    {p.price ? <span style={S.pprice}>{p.price}</span> : null}
                  </div>
                ))}
              </div>
            )}

            {amenities.length > 0 && (
              <div style={S.block}>
                <div style={S.label}><Dumbbell size={14} /> {t('gymInfoPage.facilitiesLabel')}</div>
                <div style={S.amenities}>
                  {amenities.map((a, i) => (
                    <span key={i} style={S.amenity}>{a}</span>
                  ))}
                </div>
              </div>
            )}

            {hasSocials && (
              <div style={S.block}>
                <div style={S.label}><MapPin size={14} /> {t('gymInfoPage.findUsLabel')}</div>
                {instagram && (
                  <div style={S.social}>
                    <Instagram size={17} />
                    <a style={S.link} href={`https://instagram.com/${encodeURIComponent(igHandle)}`} target="_blank" rel="noopener noreferrer">@{igHandle}</a>
                  </div>
                )}
                {phone && (
                  <div style={S.social}><Phone size={17} /> <a style={S.link} href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></div>
                )}
                {website && (
                  <div style={S.social}><Globe size={17} /> <a style={S.link} href={websiteHref} target="_blank" rel="noopener noreferrer">{website}</a></div>
                )}
                {address && (
                  <div style={S.social}><MapPin size={17} /> {address}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
