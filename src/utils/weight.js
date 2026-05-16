// Single source of truth for weight unit handling.
// Canonical storage unit is KG. Convert ONLY at display time.
//
// IMPORTANT: every other conversion helper in the codebase
// (dashboard.html, client-profile.html, planner.html, client-intake.html,
// workoutProgression.js, save-weight-proof.js, voice parsers) must be
// migrated to use these functions / this constant. Do not reintroduce
// local copies with different precision.

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB; // 2.2046226218...

const round1 = (n) => Math.round(n * 10) / 10;

export function normalizeUnit(u, fallback = 'lbs') {
  const s = String(u == null ? '' : u).toLowerCase();
  if (s === 'kg' || s === 'kgs') return 'kg';
  if (s === 'lb' || s === 'lbs' || s === 'pound' || s === 'pounds') return 'lbs';
  return fallback;
}

export function toKg(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return 0;
  return normalizeUnit(unit) === 'kg' ? round1(v) : round1(v * KG_PER_LB);
}

export function fromKg(valueKg, unit) {
  const v = Number(valueKg);
  if (!Number.isFinite(v) || v === 0) return 0;
  return normalizeUnit(unit) === 'kg' ? round1(v) : round1(v * LB_PER_KG);
}

export function convertWeight(value, fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return 0;
  if (from === to) return round1(v);
  return from === 'lbs' && to === 'kg' ? round1(v * KG_PER_LB) : round1(v * LB_PER_KG);
}

// formatWeight(2.3, 'kg') -> "2.3 kg"; options: { decimals, withUnit }
export function formatWeight(value, unit, options = {}) {
  const { decimals = 1, withUnit = true } = options;
  const u = normalizeUnit(unit, 'kg');
  const n = Number(value);
  const num = Number.isFinite(n)
    ? (decimals === 1 ? round1(n) : Number(n.toFixed(decimals)))
    : 0;
  return withUnit ? `${num} ${u}` : String(num);
}
