import { useState, useEffect } from 'react';
import { Clock, Calendar, MapPin, Phone, Instagram, Globe } from 'lucide-react';
import { apiGet } from '../utils/api';

const DAYS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'],
  ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']
];

function fmtTime(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || '';
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Read-only gym info for members (hours, classes, socials). The coach edits
 * this on their dashboard; here we just display whatever they've saved.
 * Renders nothing if the gym hasn't set anything up.
 */
export default function GymInfoCard({ coachId }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!coachId) return;
    let cancelled = false;
    apiGet(`/.netlify/functions/get-gym-info?coachId=${coachId}`)
      .then((res) => { if (!cancelled) setInfo(res && res.gym_info ? res.gym_info : null); })
      .catch(() => { /* stay hidden on error */ });
    return () => { cancelled = true; };
  }, [coachId]);

  if (!info) return null;

  const hours = info.hours || {};
  const dayCells = DAYS.map(([k]) => hours[k]).filter(Boolean);
  const hasHours = dayCells.length > 0;
  const allOpen = hasHours && dayCells.every((d) => d && !d.closed);
  const first = hours.mon || dayCells[0];
  const identical = allOpen && first && dayCells.every((d) => d.open === first.open && d.close === first.close);

  const classes = Array.isArray(info.classes) ? info.classes.filter((c) => c && c.name && c.name.trim()) : [];

  const instagram = (info.instagram || '').trim();
  const igHandle = instagram.replace(/^@/, '');
  const phone = (info.phone || '').trim();
  const website = (info.website || '').trim();
  const websiteHref = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  const address = (info.address || '').trim();
  const hasSocials = instagram || phone || website || address;

  if (!hasHours && !classes.length && !hasSocials) return null;

  const S = {
    card: {
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border-primary, #e2e8f0)',
      borderRadius: 16,
      padding: '16px 18px',
      marginTop: 16,
    },
    title: {
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #0f172a)',
      margin: '0 0 4px',
    },
    sub: { fontSize: 12.5, color: 'var(--text-secondary, #64748b)', margin: '0 0 14px' },
    block: { marginBottom: 16 },
    label: {
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase',
      color: 'var(--text-secondary, #94a3b8)', marginBottom: 8,
    },
    hoursAll: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #334155)' },
    hoursRow: {
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '4px 0', fontSize: 14, color: 'var(--text-primary, #334155)',
    },
    day: { fontWeight: 700 },
    closed: { color: 'var(--text-secondary, #cbd5e1)' },
    cls: {
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '7px 0', fontSize: 14, color: 'var(--text-primary, #334155)',
    },
    cname: { fontWeight: 700 },
    csched: { color: 'var(--text-secondary, #64748b)', fontSize: 13.5 },
    free: {
      fontSize: 11, fontWeight: 700, color: '#059669',
      background: 'rgba(5,150,105,0.12)', borderRadius: 6, padding: '2px 8px',
    },
    social: {
      display: 'inline-flex', alignItems: 'center', gap: 7,
      fontSize: 14, color: 'var(--text-primary, #334155)', marginBottom: 8,
    },
    link: { color: 'var(--brand-primary, #14b8a6)', textDecoration: 'none', fontWeight: 600 },
  };

  return (
    <div style={S.card}>
      <h3 style={S.title}>🏠 Gym Info</h3>
      <p style={S.sub}>Hours, classes &amp; where to find us</p>

      {hasHours && (
        <div style={S.block}>
          <div style={S.label}><Clock size={13} /> Hours</div>
          {identical ? (
            <div style={S.hoursAll}>Open daily · {fmtTime(first.open)} – {fmtTime(first.close)}</div>
          ) : (
            DAYS.map(([k, abbr]) => {
              const d = hours[k];
              if (!d) return null;
              return (
                <div key={k} style={S.hoursRow}>
                  <span style={S.day}>{abbr}</span>
                  <span>{d.closed ? <span style={S.closed}>Closed</span> : `${fmtTime(d.open)} – ${fmtTime(d.close)}`}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {classes.length > 0 && (
        <div style={S.block}>
          <div style={S.label}><Calendar size={13} /> Classes</div>
          {classes.map((c, i) => (
            <div key={i} style={S.cls}>
              <span style={S.cname}>{c.name}</span>
              {c.schedule ? <span style={S.csched}>{c.schedule}</span> : null}
              {c.included ? <span style={S.free}>Free with membership</span> : null}
            </div>
          ))}
        </div>
      )}

      {hasSocials && (
        <div style={{ ...S.block, marginBottom: 0 }}>
          <div style={S.label}><MapPin size={13} /> Find us</div>
          {instagram && (
            <div style={S.social}>
              <Instagram size={15} />
              <a style={S.link} href={`https://instagram.com/${encodeURIComponent(igHandle)}`} target="_blank" rel="noopener noreferrer">@{igHandle}</a>
            </div>
          )}
          {phone && (
            <div style={S.social}><Phone size={15} /> <a style={S.link} href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></div>
          )}
          {website && (
            <div style={S.social}><Globe size={15} /> <a style={S.link} href={websiteHref} target="_blank" rel="noopener noreferrer">{website}</a></div>
          )}
          {address && (
            <div style={S.social}><MapPin size={15} /> {address}</div>
          )}
        </div>
      )}
    </div>
  );
}
