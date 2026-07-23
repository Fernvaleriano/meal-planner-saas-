import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Trophy, Medal, Flame, Loader2, X, Plus, ChevronDown, ChevronUp,
  TrendingUp, Dumbbell, Calculator, Target, Pencil, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { getDateLocale } from '../utils/dateLocale';
import { KG_PER_LB, LB_PER_KG } from '../utils/weight';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

// ---------------------------------------------------------------------------
// Constants + helpers
// ---------------------------------------------------------------------------

const UNIT_STORAGE_KEY = 'strengthhub-unit';

const LIFTS = [
  { key: 'squat', label: 'Squat', exerciseName: 'Barbell Back Squat', color: '#8b5cf6' },
  { key: 'bench', label: 'Bench', exerciseName: 'Barbell Bench Press', color: '#ef4444' },
  { key: 'deadlift', label: 'Deadlift', exerciseName: 'Barbell Deadlift', color: '#0ea5e9' }
];

// DOTS coefficients (bodyweight in kg)
const DOTS_MEN = [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
const DOTS_WOMEN = [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];

// 'lb' | 'kg' from any unit string ('lbs', 'LB', 'kg', 'kgs', ...)
function normUnit(u) {
  return /kg/i.test(String(u || '')) ? 'kg' : 'lb';
}

// Precise conversion (no rounding — round only at display time)
function conv(value, fromUnit, toUnit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  const from = normUnit(fromUnit);
  const to = normUnit(toUnit);
  if (from === to) return v;
  return from === 'lb' ? v * KG_PER_LB : v * LB_PER_KG;
}

// "315", "142.5" — integers when whole, 1 decimal max
function fmtW(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

function roundToIncrement(v, inc) {
  const n = Number(v);
  if (!Number.isFinite(n) || !inc) return n;
  return Math.round(n / inc) * inc;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    return d.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    return d.toLocaleDateString(getDateLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function daysUntil(dateStr) {
  try {
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d - today) / 86400000);
  } catch {
    return null;
  }
}

function dotsScore(totalKg, bwKg, isFemale) {
  if (!Number.isFinite(totalKg) || !Number.isFinite(bwKg) || totalKg <= 0 || bwKg <= 0) return null;
  const c = isFemale ? DOTS_WOMEN : DOTS_MEN;
  const denom = c[0] + c[1] * bwKg + c[2] * bwKg * bwKg + c[3] * Math.pow(bwKg, 3) + c[4] * Math.pow(bwKg, 4);
  if (!Number.isFinite(denom) || denom === 0) return null;
  return (totalKg * 500) / denom;
}

function strengthLevel(dots) {
  if (dots == null) return null;
  if (dots < 200) return { label: 'Novice', color: '#64748b' };
  if (dots < 300) return { label: 'Intermediate', color: '#0ea5e9' };
  if (dots < 400) return { label: 'Advanced', color: '#8b5cf6' };
  if (dots <= 500) return { label: 'Elite', color: '#f59e0b' };
  return { label: 'World class', color: '#ef4444' };
}

const SOURCE_LABELS = { tested: 'Tested', estimated: 'Estimated', competition: 'Competition' };

// IPF calibrated kg plates + common lb gym plates
const KG_PLATES = [
  { w: 25, color: '#dc2626', text: '#fff', size: 52 },
  { w: 20, color: '#2563eb', text: '#fff', size: 48 },
  { w: 15, color: '#eab308', text: '#1f2937', size: 44 },
  { w: 10, color: '#16a34a', text: '#fff', size: 38 },
  { w: 5, color: '#f8fafc', text: '#1f2937', size: 32, border: true },
  { w: 2.5, color: '#dc2626', text: '#fff', size: 26 },
  { w: 1.25, color: '#cbd5e1', text: '#1f2937', size: 22 }
];
const LB_PLATES = [
  { w: 45, color: '#475569', text: '#fff', size: 52 },
  { w: 35, color: '#475569', text: '#fff', size: 46 },
  { w: 25, color: '#475569', text: '#fff', size: 40 },
  { w: 10, color: '#64748b', text: '#fff', size: 32 },
  { w: 5, color: '#64748b', text: '#fff', size: 27 },
  { w: 2.5, color: '#94a3b8', text: '#1f2937', size: 22 }
];

// ---------------------------------------------------------------------------
// Shared styles (inline, CSS-var driven so light/dark themes both work)
// ---------------------------------------------------------------------------

const S = {
  page: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '16px 16px calc(96px + env(safe-area-inset-bottom))'
  },
  headerRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginBottom: 14
  },
  title: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 24, fontWeight: 800, color: 'var(--text-primary, #0f172a)', margin: 0
  },
  card: {
    background: 'var(--bg-card, #fff)',
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: 16,
    padding: '16px',
    marginBottom: 14
  },
  cardLabel: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase',
    color: 'var(--text-secondary, #64748b)', marginBottom: 12
  },
  muted: { color: 'var(--text-secondary, #64748b)' },
  smallMuted: { fontSize: 12, color: 'var(--text-tertiary, #94a3b8)' },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', fontSize: 16, borderRadius: 10,
    border: '1px solid var(--border-primary, #e2e8f0)',
    background: 'var(--bg-secondary, #f8fafc)',
    color: 'var(--text-primary, #0f172a)'
  },
  select: {
    padding: '10px 12px', fontSize: 15, borderRadius: 10,
    border: '1px solid var(--border-primary, #e2e8f0)',
    background: 'var(--bg-secondary, #f8fafc)',
    color: 'var(--text-primary, #0f172a)'
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 16px', fontSize: 14, fontWeight: 700, borderRadius: 10,
    border: 'none', cursor: 'pointer',
    background: 'var(--brand-primary, #14b8a6)', color: '#fff'
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10,
    border: '1px solid var(--border-primary, #e2e8f0)', cursor: 'pointer',
    background: 'transparent', color: 'var(--text-primary, #334155)'
  },
  tag: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase',
    borderRadius: 6, padding: '3px 8px', display: 'inline-block'
  },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.5px', color: 'var(--text-tertiary, #94a3b8)', padding: '6px 8px'
  },
  td: {
    fontSize: 14, color: 'var(--text-primary, #334155)',
    padding: '8px', borderTop: '1px dashed var(--border-primary, #e2e8f0)'
  }
};

function Segmented({ options, value, onChange, accentFor }) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 3, borderRadius: 12,
      background: 'var(--bg-tertiary, #f1f5f9)', width: 'fit-content', maxWidth: '100%'
    }}>
      {options.map((o) => {
        const active = o.value === value;
        const accent = (accentFor && accentFor(o.value)) || 'var(--brand-primary, #14b8a6)';
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 9,
              padding: '7px 14px', fontSize: 13, fontWeight: 700,
              background: active ? accent : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary, #64748b)',
              transition: 'background 0.15s ease'
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CollapsibleCard({ icon: Icon, title, subtitle, open, onToggle, children }) {
  return (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '15px 16px', border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left'
        }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
          background: 'rgba(20, 184, 166, 0.12)', color: 'var(--brand-primary, #14b8a6)'
        }}>
          <Icon size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>{title}</span>
          {subtitle && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary, #94a3b8)' }}>{subtitle}</span>}
        </span>
        {open ? <ChevronUp size={18} style={{ color: 'var(--text-tertiary, #94a3b8)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-tertiary, #94a3b8)' }} />}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// e1RM trend chart — same responsive-SVG approach as WorkoutHistory's
// "Max Weight Over Time" MiniLineChart (ResizeObserver + nice y ticks +
// hover/touch nearest-point tooltip), with the latest point highlighted.
// ---------------------------------------------------------------------------

function niceCeil(x) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

function E1rmChart({ data, height = 190, color = '#14b8a6', unit = 'lb' }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const metrics = useMemo(() => {
    if (!data || data.length === 0 || containerWidth === 0) return null;
    const paddingLeft = 44;
    const paddingRight = 16;
    const paddingTop = 18;
    const paddingBottom = 34;
    const w = containerWidth;
    const h = height;
    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;

    const values = data.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Zoom in on the working range rather than always starting at 0 — 1RMs
    // move by small percentages, a 0-based axis flattens the trend.
    let minVal = Math.max(0, Math.floor((rawMin * 0.95) / 5) * 5);
    let maxVal = niceCeil(rawMax * 1.03);
    if (maxVal <= minVal) maxVal = minVal + 5;
    const valRange = maxVal - minVal;

    const points = data.map((d, i) => ({
      x: paddingLeft + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
      y: paddingTop + plotH - ((d.value - minVal) / valRange) * plotH,
      label: d.label,
      value: d.value
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x},${paddingTop + plotH} L${points[0].x},${paddingTop + plotH} Z`;

    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const val = minVal + (valRange * i) / 4;
      const y = paddingTop + plotH - (i / 4) * plotH;
      yTicks.push({ y, label: fmtW(val) });
    }

    const targetLabelCount = Math.min(data.length, Math.max(2, Math.floor(plotW / 64)));
    const xLabels = [];
    if (data.length === 1) {
      xLabels.push({ x: points[0].x, label: data[0].label });
    } else {
      for (let i = 0; i < targetLabelCount; i++) {
        const idx = Math.round((i / (targetLabelCount - 1)) * (data.length - 1));
        xLabels.push({ x: points[idx].x, label: data[idx].label });
      }
    }

    return { w, h, paddingLeft, paddingTop, plotH, points, linePath, areaPath, yTicks, xLabels };
  }, [data, containerWidth, height]);

  const pickNearest = useCallback((clientX) => {
    if (!metrics || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let closest = 0;
    let closestDist = Infinity;
    metrics.points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setHoveredIndex(closest);
  }, [metrics]);

  if (!data || data.length === 0) return null;
  if (!metrics) return <div ref={containerRef} style={{ width: '100%', height }} />;

  const { w, h, points, linePath, areaPath, yTicks, xLabels, paddingLeft, paddingTop, plotH } = metrics;
  const lastIdx = points.length - 1;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: 'block', touchAction: 'none', maxWidth: '100%' }}
        onMouseMove={(e) => pickNearest(e.clientX)}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={(e) => e.touches[0] && pickNearest(e.touches[0].clientX)}
        onTouchEnd={() => setHoveredIndex(null)}
      >
        {yTicks.map((tick, i) => (
          <line key={`g-${i}`} x1={paddingLeft} y1={tick.y} x2={w - 16} y2={tick.y}
            stroke="var(--border-primary, #e2e8f0)" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        <path d={areaPath} fill={color} opacity="0.1" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const isLatest = i === lastIdx;
          const isHovered = hoveredIndex === i;
          return (
            <circle key={`pt-${i}`} cx={p.x} cy={p.y}
              r={isHovered ? 6 : isLatest ? 5 : 3}
              fill={isLatest || isHovered ? color : 'var(--bg-card, #fff)'}
              stroke={color} strokeWidth="2" />
          );
        })}
        {/* Latest value called out above its dot */}
        {hoveredIndex === null && (
          <text x={Math.min(points[lastIdx].x, w - 40)} y={Math.max(points[lastIdx].y - 10, 12)}
            textAnchor="middle" fontSize="12" fontWeight="800" fill={color}>
            {fmtW(points[lastIdx].value)}
          </text>
        )}
        {yTicks.map((tick, i) => (
          <text key={`y-${i}`} x={paddingLeft - 8} y={tick.y + 4} textAnchor="end"
            fontSize="10" fill="var(--text-tertiary, #94a3b8)">{tick.label}</text>
        ))}
        {xLabels.map((xl, i) => (
          <text key={`x-${i}`} x={xl.x} y={paddingTop + plotH + 18} textAnchor="middle"
            fontSize="10" fill="var(--text-tertiary, #94a3b8)">{xl.label}</text>
        ))}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <g>
            <line x1={points[hoveredIndex].x} y1={paddingTop} x2={points[hoveredIndex].x} y2={paddingTop + plotH}
              stroke={color} strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            <rect x={Math.min(Math.max(points[hoveredIndex].x - 44, 2), w - 90)} y={Math.max(points[hoveredIndex].y - 32, 2)}
              width="88" height="22" rx="5" fill="#1e293b" />
            <text x={Math.min(Math.max(points[hoveredIndex].x, 46), w - 46)} y={Math.max(points[hoveredIndex].y - 17, 17)}
              textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              {fmtW(points[hoveredIndex].value)} {unit}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set/Update max modal
// ---------------------------------------------------------------------------

function MaxModal({ config, defaultUnit, onClose, onSave, saving }) {
  // config: { liftKey|null, exerciseName|'' (editable when no liftKey), title }
  const [name, setName] = useState(config.exerciseName || '');
  const [weight, setWeight] = useState(config.currentWeight != null ? String(config.currentWeight) : '');
  const [unit, setUnit] = useState(defaultUnit);
  const [source, setSource] = useState('tested');
  const [notes, setNotes] = useState('');
  const nameLocked = !!config.liftKey;

  const canSave = (nameLocked || name.trim().length > 0) && Number(weight) > 0 && !saving;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: 'var(--bg-card, #fff)',
          borderRadius: '18px 18px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.25)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>{config.title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ ...S.ghostBtn, padding: 7, borderRadius: 999 }}><X size={18} /></button>
        </div>

        {!nameLocked && (
          <div style={{ marginBottom: 12 }}>
            <label style={S.smallMuted}>Exercise</label>
            <input
              style={{ ...S.input, marginTop: 4 }}
              placeholder="e.g. Overhead Press"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        {nameLocked && (
          <div style={{ ...S.smallMuted, marginBottom: 12 }}>Logged as {config.exerciseName}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.smallMuted}>1RM weight</label>
            <input
              style={{ ...S.input, marginTop: 4 }}
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div>
            <label style={S.smallMuted}>Unit</label>
            <select style={{ ...S.select, display: 'block', marginTop: 4 }} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={S.smallMuted}>How was it set?</label>
          <select style={{ ...S.select, display: 'block', width: '100%', marginTop: 4 }} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="tested">Tested in the gym</option>
            <option value="estimated">Estimated</option>
            <option value="competition">Competition</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={S.smallMuted}>Note (optional)</label>
          <input
            style={{ ...S.input, marginTop: 4 }}
            placeholder="Belt + sleeves, paused, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
          />
        </div>

        <button
          style={{ ...S.primaryBtn, width: '100%', padding: '13px 16px', opacity: canSave ? 1 : 0.5 }}
          disabled={!canSave}
          onClick={() => onSave({
            liftKey: config.liftKey || null,
            exerciseName: nameLocked ? config.exerciseName : name.trim(),
            maxWeight: Number(weight),
            weightUnit: unit,
            source,
            notes: notes.trim() || undefined
          })}
        >
          {saving ? <Loader2 size={16} className="spinning" /> : null}
          {saving ? 'Saving…' : 'Save max'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StrengthHub page
// ---------------------------------------------------------------------------

export default function StrengthHub() {
  const { clientData } = useAuth();
  const clientId = clientData?.id;
  const isCoach = clientData?.is_coach === true;

  // Display unit: sticky, defaults from the profile's unit preference
  const [unit, setUnit] = useState(() => {
    try {
      const saved = localStorage.getItem(UNIT_STORAGE_KEY);
      if (saved === 'lb' || saved === 'kg') return saved;
    } catch { /* ignore */ }
    return clientData?.unit_preference === 'metric' ? 'kg' : 'lb';
  });
  const changeUnit = (u) => {
    setUnit(u);
    try { localStorage.setItem(UNIT_STORAGE_KEY, u); } catch { /* ignore */ }
  };

  // If the profile hydrated after mount and the user has never picked a unit
  // here, follow their profile preference (metric → kg).
  useEffect(() => {
    if (!clientData) return;
    try {
      if (localStorage.getItem(UNIT_STORAGE_KEY)) return;
    } catch { /* ignore */ }
    setUnit(clientData.unit_preference === 'metric' ? 'kg' : 'lb');
  }, [clientData]);

  // Data
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // e1RM series per lift, always fetched in kg (converted at display time so
  // the unit toggle never refetches). undefined = loading, null = failed.
  const [series, setSeries] = useState({ squat: undefined, bench: undefined, deadlift: undefined });

  // UI state
  const [meetExpanded, setMeetExpanded] = useState(false);
  const [chartLift, setChartLift] = useState('squat');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLift, setPlannerLift] = useState('squat');
  const [goalInput, setGoalInput] = useState('');
  const goalTouchedRef = useRef(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [plateTarget, setPlateTarget] = useState('');
  const [plateUnit, setPlateUnit] = useState(unit);
  const [barType, setBarType] = useState('standard'); // standard | womens
  const [plateSet, setPlateSet] = useState(unit === 'kg' ? 'kg' : 'lb');
  const [maxModal, setMaxModal] = useState(null);
  const [savingMax, setSavingMax] = useState(false);

  const fetchSeries = useCallback((lift) => {
    if (!clientId) return Promise.resolve();
    return apiGet(`/.netlify/functions/athlete-hub?clientId=${clientId}&view=e1rm&lift=${lift}&unit=kg`)
      .then((res) => setSeries((prev) => ({ ...prev, [lift]: res?.series || [] })))
      .catch(() => setSeries((prev) => ({ ...prev, [lift]: null })));
  }, [clientId]);

  const fetchAll = useCallback(async () => {
    if (!clientId || isCoach) { setLoading(false); return; }
    setError(null);
    try {
      const [hubRes] = await Promise.all([
        apiGet(`/.netlify/functions/athlete-hub?clientId=${clientId}&view=hub`),
        fetchSeries('squat'),
        fetchSeries('bench'),
        fetchSeries('deadlift')
      ]);
      setHub(hubRes);
    } catch (err) {
      console.error('Strength hub load failed:', err);
      setError('Could not load your strength data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [clientId, isCoach, fetchSeries]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  usePullToRefreshEvent(fetchAll);

  // Refresh only the hub payload after a mutation (no full-page spinner)
  const refreshHub = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await apiGet(`/.netlify/functions/athlete-hub?clientId=${clientId}&view=hub`);
      setHub(res);
    } catch { /* keep current state */ }
  }, [clientId]);

  // ── Derived data ──
  const currentMaxes = useMemo(() => {
    const out = {};
    const maxes = hub?.maxes || [];
    LIFTS.forEach((l) => {
      out[l.key] = maxes.find((m) => m.lift_key === l.key && m.is_current) || null;
    });
    return out;
  }, [hub]);

  const accessoryMaxes = useMemo(
    () => (hub?.maxes || []).filter((m) => !m.lift_key && m.is_current),
    [hub]
  );

  // Best e1RM (kg) in the last 90 days per lift
  const best90 = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const out = {};
    LIFTS.forEach((l) => {
      const s = series[l.key];
      if (!Array.isArray(s) || s.length === 0) { out[l.key] = null; return; }
      let best = null;
      s.forEach((p) => {
        if (p.date >= cutoff && (best == null || p.e1rm > best)) best = p.e1rm;
      });
      out[l.key] = best;
    });
    return out;
  }, [series]);

  // Upcoming competition (nearest future, not cancelled/completed)
  const nextComp = useMemo(() => {
    const comps = hub?.competitions || [];
    const upcoming = comps.filter((c) => {
      if (!c.comp_date) return false;
      if (c.status === 'cancelled' || c.status === 'completed') return false;
      const d = daysUntil(c.comp_date);
      return d != null && d >= 0;
    });
    upcoming.sort((a, b) => (a.comp_date < b.comp_date ? -1 : 1));
    return upcoming[0] || null;
  }, [hub]);

  // Total + DOTS
  const totalInfo = useMemo(() => {
    const rows = LIFTS.map((l) => currentMaxes[l.key]);
    if (rows.some((r) => !r)) return { complete: false };
    const totalKg = rows.reduce((sum, r) => sum + conv(r.max_weight, r.weight_unit, 'kg'), 0);
    const bw = hub?.bodyweight;
    const bwKg = bw ? conv(bw.weight, bw.unit, 'kg') : null;
    const genderRaw = String(hub?.client?.gender || '').toLowerCase();
    const isFemale = genderRaw.startsWith('f') || genderRaw === 'woman';
    const genderKnown = genderRaw.startsWith('f') || genderRaw.startsWith('m') || genderRaw === 'woman' || genderRaw === 'man';
    const dots = bwKg ? dotsScore(totalKg, bwKg, isFemale) : null;
    return { complete: true, totalKg, bwKg, dots, isFemale, genderKnown };
  }, [currentMaxes, hub]);

  // Attempt planner defaults — current max, or best recent e1RM if higher
  const plannerDefaultGoal = useMemo(() => {
    const row = currentMaxes[plannerLift];
    const maxDisp = row ? conv(row.max_weight, row.weight_unit, unit) : null;
    const e1Disp = best90[plannerLift] != null ? conv(best90[plannerLift], 'kg', unit) : null;
    const base = Math.max(maxDisp || 0, e1Disp || 0);
    return base > 0 ? Math.round(base * 10) / 10 : null;
  }, [currentMaxes, best90, plannerLift, unit]);

  useEffect(() => {
    if (!goalTouchedRef.current) {
      setGoalInput(plannerDefaultGoal != null ? String(plannerDefaultGoal) : '');
    }
  }, [plannerDefaultGoal]);

  // ── Guards ──
  if (!clientData) {
    return (
      <div style={{ ...S.page, textAlign: 'center', paddingTop: 80, color: 'var(--text-secondary, #64748b)' }}>
        <Loader2 size={26} className="spinning" />
      </div>
    );
  }
  if (isCoach) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
          <Trophy size={36} style={{ color: 'var(--text-tertiary, #94a3b8)', marginBottom: 10 }} />
          <h2 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--text-primary, #0f172a)' }}>Members only</h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            The Strength hub lives in your members' app. Open a client's profile to see their lifts.
          </p>
        </div>
      </div>
    );
  }

  // ── Renderers ──

  const renderMeetBanner = () => {
    if (!nextComp) return null;
    const days = daysUntil(nextComp.comp_date);
    const isShow = nextComp.comp_type === 'show';
    const meetWeek = days != null && days <= 7;
    const peakWeek = !meetWeek && days != null && days <= 14;
    const accent = meetWeek ? '#ef4444' : peakWeek ? '#f59e0b' : 'var(--brand-primary, #14b8a6)';
    return (
      <button
        onClick={() => setMeetExpanded((v) => !v)}
        style={{
          ...S.card,
          width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block',
          borderLeft: `4px solid ${accent}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...S.tag, background: isShow ? 'rgba(236, 72, 153, 0.14)' : 'rgba(20, 184, 166, 0.14)', color: isShow ? '#ec4899' : 'var(--brand-primary, #14b8a6)' }}>
            {isShow ? 'Show' : 'Meet'}
          </span>
          {meetWeek && <span style={{ ...S.tag, background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444' }}>Meet week</span>}
          {peakWeek && <span style={{ ...S.tag, background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b' }}>Peak week</span>}
          <span style={{ marginLeft: 'auto' }}>
            {meetExpanded ? <ChevronUp size={16} style={S.muted} /> : <ChevronDown size={16} style={S.muted} />}
          </span>
        </div>
        <div style={{ marginTop: 8, fontSize: 17, fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-primary, #0f172a)' }}>
          {nextComp.name}
          <span style={{ color: accent }}>
            {' — '}
            {days === 0 ? 'today!' : meetWeek ? 'MEET WEEK' : `${days} days out`}
          </span>
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
          {formatFullDate(nextComp.comp_date)}
          {nextComp.federation ? ` · ${nextComp.federation}` : ''}
          {nextComp.weight_class ? ` · ${nextComp.weight_class}` : ''}
        </div>
        {meetExpanded && (
          <div style={{ marginTop: 12, borderTop: '1px dashed var(--border-primary, #e2e8f0)', paddingTop: 12, fontSize: 14, color: 'var(--text-primary, #334155)', display: 'grid', gap: 6 }}>
            {nextComp.location && <div><span style={S.muted}>Where:</span> {nextComp.location}</div>}
            {nextComp.division && <div><span style={S.muted}>Division:</span> {nextComp.division}</div>}
            {nextComp.goal_total != null && <div><span style={S.muted}>Goal total:</span> <strong>{fmtW(nextComp.goal_total)}</strong></div>}
            {nextComp.notes && <div style={{ whiteSpace: 'pre-wrap' }}><span style={S.muted}>Notes:</span> {nextComp.notes}</div>}
          </div>
        )}
      </button>
    );
  };

  const renderBigThree = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
      {LIFTS.map((lift) => {
        const row = currentMaxes[lift.key];
        const maxDisp = row ? conv(row.max_weight, row.weight_unit, unit) : null;
        const e1Kg = best90[lift.key];
        const e1Disp = e1Kg != null ? conv(e1Kg, 'kg', unit) : null;
        const delta = maxDisp != null && e1Disp != null ? e1Disp - maxDisp : null;
        return (
          <div key={lift.key} style={{ ...S.card, marginBottom: 0, borderTop: `3px solid ${lift.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: lift.color }}>
                {lift.label}
              </span>
              {row?.source && (
                <span style={{ ...S.tag, background: 'var(--bg-tertiary, #f1f5f9)', color: 'var(--text-secondary, #64748b)' }}>
                  {SOURCE_LABELS[row.source] || row.source}
                </span>
              )}
            </div>

            {row ? (
              <>
                <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800, color: 'var(--text-primary, #0f172a)', lineHeight: 1.1 }}>
                  {fmtW(maxDisp)} <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-tertiary, #94a3b8)' }}>{unit}</span>
                </div>
                <div style={{ marginTop: 2, ...S.smallMuted }}>
                  {row.achieved_date ? formatDate(row.achieved_date) : ''}
                </div>
                {e1Disp != null && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <TrendingUp size={13} style={{ color: lift.color }} />
                    Recent e1RM {fmtW(e1Disp)} {unit}
                    {delta != null && Math.abs(delta) >= 0.5 && (
                      <span style={{ fontWeight: 800, color: delta > 0 ? '#10b981' : '#ef4444' }}>
                        ({delta > 0 ? '+' : ''}{fmtW(delta)})
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
                No 1RM on file yet.
                {e1Disp != null && <div style={{ marginTop: 4 }}>Recent e1RM: <strong>{fmtW(e1Disp)} {unit}</strong></div>}
              </div>
            )}

            <button
              style={{ ...S.ghostBtn, marginTop: 12, width: '100%' }}
              onClick={() => setMaxModal({
                liftKey: lift.key,
                exerciseName: lift.exerciseName,
                title: row ? `Update ${lift.label} 1RM` : `Set your ${lift.label} 1RM`,
                currentWeight: maxDisp != null ? (maxDisp % 1 === 0 ? Math.round(maxDisp) : Math.round(maxDisp * 10) / 10) : null
              })}
            >
              <Pencil size={14} /> {row ? 'Update' : 'Set your 1RM'}
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderTotalDots = () => {
    const { complete, totalKg, bwKg, dots, isFemale, genderKnown } = totalInfo;
    const totalDisp = complete ? conv(totalKg, 'kg', unit) : null;
    const level = strengthLevel(dots);
    const bw = hub?.bodyweight;
    return (
      <div style={S.card}>
        <div style={S.cardLabel}><Trophy size={14} /> Total &amp; DOTS</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={S.smallMuted}>Total (S + B + D)</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary, #0f172a)', lineHeight: 1.1 }}>
              {complete ? <>{fmtW(totalDisp)} <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-tertiary, #94a3b8)' }}>{unit}</span></> : '—'}
            </div>
          </div>
          <div>
            <div style={S.smallMuted}>DOTS</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-primary, #14b8a6)', lineHeight: 1.1 }}>
              {dots != null ? dots.toFixed(1) : '—'}
            </div>
          </div>
          {level && (
            <span style={{ ...S.tag, background: level.color + '20', color: level.color, marginBottom: 6, fontSize: 12 }}>
              {level.label}
            </span>
          )}
        </div>
        <div style={{ marginTop: 10, ...S.smallMuted }}>
          {!complete && 'Set a current 1RM for squat, bench, and deadlift to see your total.'}
          {complete && !bwKg && 'Log a bodyweight (check-in or measurement) to get your DOTS score.'}
          {complete && bwKg != null && (
            <>
              At {fmtW(conv(bwKg, 'kg', unit))} {unit} bodyweight
              {bw ? ` (last logged ${fmtW(bw.weight)} ${normUnit(bw.unit)})` : ''}
              {' · '}{isFemale ? "women's" : "men's"} scale
              {!genderKnown && ' — gender not set, assuming men’s coefficients'}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTrendChart = () => {
    const lift = LIFTS.find((l) => l.key === chartLift) || LIFTS[0];
    const s = series[chartLift];
    const loadingSeries = s === undefined;
    const failed = s === null;
    const chartData = Array.isArray(s)
      ? s.map((p) => ({ label: formatDate(p.date), value: conv(p.e1rm, 'kg', unit) }))
      : [];
    const latest = Array.isArray(s) && s.length > 0 ? s[s.length - 1] : null;
    return (
      <div style={S.card}>
        <div style={S.cardLabel}><TrendingUp size={14} /> Estimated 1RM trend</div>
        <div style={{ marginBottom: 12, overflowX: 'auto' }}>
          <Segmented
            options={LIFTS.map((l) => ({ value: l.key, label: l.label }))}
            value={chartLift}
            onChange={(k) => {
              setChartLift(k);
              if (series[k] === null) {
                setSeries((prev) => ({ ...prev, [k]: undefined }));
                fetchSeries(k);
              }
            }}
            accentFor={(k) => LIFTS.find((l) => l.key === k)?.color}
          />
        </div>
        {loadingSeries ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-tertiary, #94a3b8)' }}>
            <Loader2 size={20} className="spinning" />
          </div>
        ) : failed ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            Couldn't load this chart.{' '}
            <button style={{ ...S.ghostBtn, marginLeft: 6 }} onClick={() => { setSeries((prev) => ({ ...prev, [chartLift]: undefined })); fetchSeries(chartLift); }}>Retry</button>
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            Log {lift.label.toLowerCase()} sets in your workouts and your estimated 1RM will chart here.
          </div>
        ) : (
          <>
            <E1rmChart data={chartData} unit={unit} color={lift.color} />
            {latest && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
                Est. from {latest.reps} × {fmtW(conv(latest.weight, 'kg', unit))} {unit}
                {latest.rpe != null ? ` @ RPE ${latest.rpe}` : ''} on {formatDate(latest.date)}
                {latest.exerciseName ? ` (${latest.exerciseName})` : ''}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderAttemptPlanner = () => {
    const inc = unit === 'kg' ? 2.5 : 5;
    const otherUnit = unit === 'kg' ? 'lb' : 'kg';
    const goal = Number(goalInput);
    const hasGoal = Number.isFinite(goal) && goal > 0;
    const attempts = hasGoal ? [
      { label: 'Opener', pct: 0.91 },
      { label: 'Second', pct: 0.96 },
      { label: 'Third', pct: 1.0 }
    ].map((a) => {
      const raw = goal * a.pct;
      const rounded = roundToIncrement(raw, inc);
      return { ...a, weight: rounded, other: conv(rounded, unit, otherUnit) };
    }) : [];
    const opener = attempts[0]?.weight || 0;
    const barW = unit === 'kg' ? 20 : 45;
    const warmups = hasGoal ? [
      { label: 'Bar', weight: barW, reps: 5 },
      { label: '40%', weight: Math.max(barW, roundToIncrement(opener * 0.4, inc)), reps: 3 },
      { label: '60%', weight: Math.max(barW, roundToIncrement(opener * 0.6, inc)), reps: 2 },
      { label: '75%', weight: Math.max(barW, roundToIncrement(opener * 0.75, inc)), reps: 1 },
      { label: '85%', weight: Math.max(barW, roundToIncrement(opener * 0.85, inc)), reps: 1 },
      { label: '93%', weight: Math.max(barW, roundToIncrement(opener * 0.93, inc)), reps: 1 }
    ] : [];

    return (
      <CollapsibleCard
        icon={Target}
        title="Attempt planner"
        subtitle="Openers, jumps, and warm-ups for meet day"
        open={plannerOpen}
        onToggle={() => setPlannerOpen((v) => !v)}
      >
        <div style={{ marginBottom: 12, overflowX: 'auto' }}>
          <Segmented
            options={LIFTS.map((l) => ({ value: l.key, label: l.label }))}
            value={plannerLift}
            onChange={(k) => { goalTouchedRef.current = false; setPlannerLift(k); }}
            accentFor={(k) => LIFTS.find((l) => l.key === k)?.color}
          />
        </div>
        <label style={S.smallMuted}>Goal 3rd attempt ({unit})</label>
        <input
          style={{ ...S.input, marginTop: 4, marginBottom: 12, maxWidth: 200 }}
          type="number"
          inputMode="decimal"
          min="0"
          placeholder={plannerDefaultGoal != null ? String(plannerDefaultGoal) : '0'}
          value={goalInput}
          onChange={(e) => { goalTouchedRef.current = true; setGoalInput(e.target.value); }}
        />
        {!hasGoal ? (
          <div style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            Enter a goal third attempt to build your plan.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Attempt</th>
                    <th style={S.th}>%</th>
                    <th style={S.th}>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.label}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{a.label}</td>
                      <td style={S.td}>{Math.round(a.pct * 100)}%</td>
                      <td style={S.td}>
                        <strong>{fmtW(a.weight)} {unit}</strong>{' '}
                        <span style={S.smallMuted}>({fmtW(a.other)} {otherUnit})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, ...S.smallMuted }}>
              Openers should feel like an easy double. Adjust on meet day with your coach. Meets load in kg.
            </div>

            <div style={{ marginTop: 14, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #64748b)' }}>
              Warm-up to your opener
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {warmups.map((wu, i) => (
                <div key={i} style={{
                  background: 'var(--bg-tertiary, #f1f5f9)', borderRadius: 10,
                  padding: '8px 10px', fontSize: 13, color: 'var(--text-primary, #334155)', textAlign: 'center'
                }}>
                  <div style={{ fontWeight: 800 }}>{fmtW(wu.weight)} {unit}</div>
                  <div style={S.smallMuted}>{wu.label} × {wu.reps}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>
    );
  };

  const renderPlateCalc = () => {
    const plates = plateSet === 'kg' ? KG_PLATES : LB_PLATES;
    const calcUnit = plateSet; // math happens in the plate set's unit
    const target = Number(plateTarget);
    const hasTarget = Number.isFinite(target) && target > 0;
    const targetConv = hasTarget ? conv(target, plateUnit, calcUnit) : 0;
    const barW = barType === 'womens' ? (calcUnit === 'kg' ? 15 : 33) : (calcUnit === 'kg' ? 20 : 45);

    let result = null;
    if (hasTarget) {
      const perSideTarget = (targetConv - barW) / 2;
      if (perSideTarget < -0.001) {
        result = { belowBar: true };
      } else {
        const counts = [];
        let remaining = perSideTarget;
        plates.forEach((p) => {
          const n = Math.floor((remaining + 1e-6) / p.w);
          if (n > 0) {
            counts.push({ ...p, count: n });
            remaining -= n * p.w;
          }
        });
        const loadedPerSide = counts.reduce((s, c) => s + c.count * c.w, 0);
        const loadedTotal = barW + 2 * loadedPerSide;
        result = {
          counts,
          loadedTotal,
          exact: Math.abs(loadedTotal - targetConv) < 0.01
        };
      }
    }

    return (
      <CollapsibleCard
        icon={Calculator}
        title="Plate calculator"
        subtitle="What goes on the bar, per side"
        open={plateOpen}
        onToggle={() => setPlateOpen((v) => !v)}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 130px', minWidth: 120 }}>
            <label style={S.smallMuted}>Target weight</label>
            <input
              style={{ ...S.input, marginTop: 4 }}
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="0"
              value={plateTarget}
              onChange={(e) => setPlateTarget(e.target.value)}
            />
          </div>
          <div>
            <label style={S.smallMuted}>Unit</label>
            <select style={{ ...S.select, display: 'block', marginTop: 4 }} value={plateUnit} onChange={(e) => setPlateUnit(e.target.value)}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </div>
          <div>
            <label style={S.smallMuted}>Bar</label>
            <select style={{ ...S.select, display: 'block', marginTop: 4 }} value={barType} onChange={(e) => setBarType(e.target.value)}>
              <option value="standard">Standard (45 lb / 20 kg)</option>
              <option value="womens">Women's (33 lb / 15 kg)</option>
            </select>
          </div>
          <div>
            <label style={S.smallMuted}>Plates</label>
            <select style={{ ...S.select, display: 'block', marginTop: 4 }} value={plateSet} onChange={(e) => setPlateSet(e.target.value)}>
              <option value="kg">kg comp plates</option>
              <option value="lb">lb gym plates</option>
            </select>
          </div>
        </div>

        {!hasTarget ? (
          <div style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>Enter a target weight to see the loading.</div>
        ) : result.belowBar ? (
          <div style={{ fontSize: 14, color: '#ef4444' }}>That's lighter than the empty bar ({fmtW(barW)} {calcUnit}).</div>
        ) : (
          <>
            {/* Plates as discs (bar side view) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: 56, padding: '6px 0' }}>
              <span style={{ width: 34, height: 8, background: 'var(--text-tertiary, #94a3b8)', borderRadius: 4, flexShrink: 0 }} title="Bar" />
              {result.counts.length === 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginLeft: 6 }}>Empty bar</span>
              )}
              {result.counts.map((c) =>
                Array.from({ length: c.count }).map((_, i) => (
                  <span
                    key={`${c.w}-${i}`}
                    style={{
                      width: Math.max(20, Math.round(c.size * 0.55)),
                      height: c.size,
                      lineHeight: `${c.size}px`,
                      borderRadius: 6,
                      background: c.color,
                      color: c.text,
                      border: c.border ? '1px solid var(--border-primary, #cbd5e1)' : 'none',
                      fontSize: 10,
                      fontWeight: 800,
                      textAlign: 'center',
                      flexShrink: 0
                    }}
                  >
                    {fmtW(c.w)}
                  </span>
                ))
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
              {result.counts.length === 0
                ? `Empty ${fmtW(barW)} ${calcUnit} bar`
                : `${result.counts.map((c) => `${c.count}×${fmtW(c.w)}`).join(' + ')} per side`}
            </div>
            {!result.exact && (
              <div style={{ marginTop: 4, fontSize: 13, color: '#f59e0b' }}>
                Can't load {fmtW(targetConv)} {calcUnit} exactly with these plates — closest below is {fmtW(result.loadedTotal)} {calcUnit}
                {plateUnit !== calcUnit ? ` (${fmtW(conv(result.loadedTotal, calcUnit, plateUnit))} ${plateUnit})` : ''}.
              </div>
            )}
            {result.exact && plateUnit !== calcUnit && (
              <div style={{ marginTop: 4, ...S.smallMuted }}>
                {fmtW(target)} {plateUnit} ≈ {fmtW(targetConv)} {calcUnit} on the bar.
              </div>
            )}
          </>
        )}
      </CollapsibleCard>
    );
  };

  const renderRecentPrs = () => {
    const prs = hub?.recentPrs || [];
    return (
      <div style={S.card}>
        <div style={S.cardLabel}><Flame size={14} /> Recent PRs</div>
        {prs.length === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            No PRs yet — every heavy set you log is a chance to put one on the board.
          </div>
        ) : (
          <div>
            {prs.map((pr, i) => {
              const w = conv(pr.maxWeight, pr.weightUnit, unit);
              return (
                <div
                  key={pr.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                    borderTop: i === 0 ? 'none' : '1px dashed var(--border-primary, #e2e8f0)'
                  }}
                >
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                    background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b'
                  }}>
                    <Medal size={15} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text-primary, #334155)' }}>
                    <strong>{Number.isFinite(w) ? `${fmtW(w)} ${unit}` : ''}{pr.reps ? ` × ${pr.reps}` : ''}</strong>{' '}
                    {pr.exerciseName}
                  </span>
                  <span style={{ ...S.smallMuted, flexShrink: 0 }}>{formatDate(pr.date)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const deleteAccessoryMax = async (row) => {
    const ok = window.confirm(`Remove your ${row.exercise_name} max?`);
    if (!ok) return;
    try {
      await apiPost('/.netlify/functions/athlete-hub', { action: 'delete-max', clientId, id: row.id });
      await refreshHub();
    } catch (err) {
      console.error('Delete max failed:', err);
      window.alert('Could not delete that max. Please try again.');
    }
  };

  const renderOtherMaxes = () => (
    <div style={S.card}>
      <div style={{ ...S.cardLabel, marginBottom: accessoryMaxes.length ? 12 : 8 }}>
        <Dumbbell size={14} /> My other maxes
      </div>
      {accessoryMaxes.length === 0 && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', marginBottom: 12 }}>
          Track 1RMs for any other lift — overhead press, rows, whatever you're chasing.
        </div>
      )}
      {accessoryMaxes.map((row, i) => {
        const w = conv(row.max_weight, row.weight_unit, unit);
        return (
          <div
            key={row.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
              borderTop: i === 0 ? 'none' : '1px dashed var(--border-primary, #e2e8f0)'
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text-primary, #334155)' }}>
              <strong>{row.exercise_name}</strong>
              <span style={{ ...S.smallMuted, marginLeft: 8 }}>{row.achieved_date ? formatDate(row.achieved_date) : ''}</span>
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary, #0f172a)', flexShrink: 0 }}>
              {fmtW(w)} {unit}
            </span>
            <button
              style={{ ...S.ghostBtn, padding: 7 }}
              aria-label={`Update ${row.exercise_name} max`}
              onClick={() => setMaxModal({
                liftKey: null,
                exerciseName: row.exercise_name,
                title: `Update ${row.exercise_name}`,
                currentWeight: Number.isFinite(w) ? (w % 1 === 0 ? Math.round(w) : Math.round(w * 10) / 10) : null
              })}
            >
              <Pencil size={14} />
            </button>
            <button
              style={{ ...S.ghostBtn, padding: 7, color: '#ef4444' }}
              aria-label={`Delete ${row.exercise_name} max`}
              onClick={() => deleteAccessoryMax(row)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button
        style={{ ...S.ghostBtn, marginTop: 12, width: '100%' }}
        onClick={() => setMaxModal({ liftKey: null, exerciseName: '', title: 'Add a lift max', currentWeight: null })}
      >
        <Plus size={15} /> Add a lift max
      </button>
    </div>
  );

  const saveMax = async (payload) => {
    setSavingMax(true);
    try {
      await apiPost('/.netlify/functions/athlete-hub', { action: 'set-max', clientId, ...payload });
      setMaxModal(null);
      await refreshHub();
    } catch (err) {
      console.error('Save max failed:', err);
      window.alert(err?.message || 'Could not save that max. Please try again.');
    } finally {
      setSavingMax(false);
    }
  };

  // ── Page ──
  return (
    <div style={S.page}>
      <div style={S.headerRow}>
        <h1 style={S.title}><Dumbbell size={22} style={{ color: 'var(--brand-primary, #14b8a6)' }} /> Strength</h1>
        <Segmented
          options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]}
          value={unit}
          onChange={changeUnit}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary, #64748b)' }}>
          <Loader2 size={26} className="spinning" />
          <p style={{ marginTop: 10, fontSize: 14 }}>Loading your lifts…</p>
        </div>
      ) : error ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>{error}</p>
          <button style={S.primaryBtn} onClick={() => { setLoading(true); fetchAll(); }}>Try again</button>
        </div>
      ) : (
        <>
          {renderMeetBanner()}
          {renderBigThree()}
          {renderTotalDots()}
          {renderTrendChart()}
          {renderAttemptPlanner()}
          {renderPlateCalc()}
          {renderRecentPrs()}
          {renderOtherMaxes()}
        </>
      )}

      {maxModal && (
        <MaxModal
          config={maxModal}
          defaultUnit={unit}
          saving={savingMax}
          onClose={() => !savingMax && setMaxModal(null)}
          onSave={saveMax}
        />
      )}
    </div>
  );
}
