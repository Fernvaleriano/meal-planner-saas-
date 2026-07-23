// Current lift maxes (1RMs) for the logged-in athlete — used to turn a coach's
// %1RM prescription into an actual target weight on the workout screen.
// Backed by athlete-hub (view=maxes); cached per client so opening several
// exercises in a session costs one request.
import { apiGet } from './api';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = { clientId: null, at: 0, maxes: null, promise: null };

export async function fetchCurrentMaxes(clientId) {
  if (!clientId) return [];
  const now = Date.now();
  if (cache.clientId === clientId && cache.maxes && now - cache.at < CACHE_TTL_MS) {
    return cache.maxes;
  }
  if (cache.clientId === clientId && cache.promise) return cache.promise;
  cache.clientId = clientId;
  cache.promise = apiGet(`/.netlify/functions/athlete-hub?clientId=${clientId}&view=maxes`)
    .then(res => {
      cache.maxes = res?.maxes || [];
      cache.at = Date.now();
      cache.promise = null;
      return cache.maxes;
    })
    .catch(() => {
      cache.promise = null;
      // Missing maxes are a normal state (module off / nothing set) — the
      // caller just skips the target-weight hint.
      return cache.maxes || [];
    });
  return cache.promise;
}

export function invalidateMaxesCache() {
  cache.maxes = null;
  cache.at = 0;
  cache.promise = null;
}

// Same competition-lift matching as the backend (athlete-hub.js) so a max
// saved under lift_key 'squat' applies to any back-squat variation name.
const LIFT_PATTERNS = {
  squat: { include: /squat/i, exclude: /(split|bulgarian|goblet|hack|front|box|jump|pistol|sissy|overhead|smith|zercher|belt)/i },
  bench: { include: /bench\s*press/i, exclude: /(incline|decline|close|dumbbell|\bdb\b|smith|machine|floor|swiss|football)/i },
  deadlift: { include: /deadlift/i, exclude: /(romanian|rdl|stiff|straight|single|trap|hex|snatch)/i }
};

export function findMaxForExercise(maxes, exerciseName, exerciseId) {
  if (!Array.isArray(maxes) || !maxes.length) return null;
  if (exerciseId != null) {
    const byId = maxes.find(m => m.exercise_id != null && String(m.exercise_id) === String(exerciseId));
    if (byId) return byId;
  }
  const name = String(exerciseName || '').trim().toLowerCase();
  if (name) {
    const byName = maxes.find(m => String(m.exercise_name || '').trim().toLowerCase() === name);
    if (byName) return byName;
    for (const key of Object.keys(LIFT_PATTERNS)) {
      const p = LIFT_PATTERNS[key];
      if (p.include.test(name) && !p.exclude.test(name)) {
        const byKey = maxes.find(m => m.lift_key === key);
        if (byKey) return byKey;
      }
    }
  }
  return null;
}

const LB_PER_KG = 2.20462;

// percent of a stored max, converted to the display unit and rounded to what
// you can actually load (2.5 kg / 5 lb steps).
export function targetWeightFromPercent(maxRow, percent, displayUnit) {
  const pct = parseFloat(percent);
  const max = parseFloat(maxRow?.max_weight);
  if (!isFinite(pct) || pct <= 0 || !isFinite(max) || max <= 0) return null;
  const fromKg = /kg/i.test(maxRow.weight_unit || 'lbs');
  const wantKg = /kg/i.test(displayUnit || 'lbs');
  let w = max * (pct / 100);
  if (fromKg && !wantKg) w *= LB_PER_KG;
  if (!fromKg && wantKg) w /= LB_PER_KG;
  const step = wantKg ? 2.5 : 5;
  const rounded = Math.round(w / step) * step;
  return rounded > 0 ? rounded : null;
}
