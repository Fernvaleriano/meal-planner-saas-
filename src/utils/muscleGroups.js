// Shared muscle-group taxonomy + workout aggregation helpers.
// Centralizes the synonym/pattern maps that AddActivityModal already used so
// the share-card muscle map can pick a primary worked muscle from the same
// rules. Keep this file dependency-free — used in both UI components and
// pure data utilities.

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'legs', 'glutes', 'core', 'cardio'
];

// Values the exercises.muscle_group column might contain → canonical group.
export const MUSCLE_SYNONYMS = {
  chest: ['chest', 'pec', 'pecs', 'pectoral', 'pectorals'],
  back: ['back', 'lat', 'lats', 'latissimus', 'rhomboid', 'rhomboids', 'traps', 'trapezius', 'upper back', 'lower back'],
  shoulders: ['shoulder', 'shoulders', 'delt', 'delts', 'deltoid', 'deltoids'],
  biceps: ['bicep', 'biceps'],
  triceps: ['tricep', 'triceps'],
  legs: ['leg', 'legs', 'quad', 'quads', 'quadriceps', 'hamstring', 'hamstrings', 'calf', 'calves', 'thigh', 'thighs'],
  glutes: ['glute', 'glutes', 'gluteus', 'gluteal', 'hip', 'hips'],
  core: ['core', 'ab', 'abs', 'abdominal', 'abdominals', 'oblique', 'obliques'],
  cardio: ['cardio', 'cardiovascular', 'aerobic', 'full_body', 'full body'],
};

// Fallback: classify by exercise name when muscle_group is missing.
export const MUSCLE_NAME_PATTERNS = {
  chest: ['chest press', 'bench press', 'chest fly', 'pec fly', 'push-up', 'pushup'],
  back: ['lat pull', 'pulldown', 'pull-up', 'pullup', 'row', 'deadlift', 'back extension'],
  shoulders: ['shoulder press', 'overhead press', 'lateral raise', 'front raise', 'delt', 'shrug'],
  biceps: ['bicep curl', 'biceps curl', 'hammer curl', 'preacher curl', 'concentration curl'],
  triceps: ['tricep', 'triceps', 'pushdown', 'push-down', 'skull crusher', 'tricep dip', 'tricep extension', 'close grip'],
  legs: ['squat', 'lunge', 'leg press', 'leg curl', 'leg extension', 'calf raise'],
  glutes: ['glute', 'hip thrust', 'glute bridge'],
  core: ['crunch', 'plank', 'sit-up', 'situp', 'ab ', ' abs', 'core'],
  cardio: ['cardio', 'running', 'jogging', 'burpee', 'mountain climber', 'jumping jack'],
};

// Disambiguators — words in an exercise name that prove it's NOT this group.
export const EXCLUSIVE_MUSCLE_KEYWORDS = {
  biceps: ['tricep', 'triceps', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf', 'ab '],
  triceps: ['bicep', 'biceps', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf', 'ab '],
  chest: ['bicep', 'tricep', 'leg', 'shoulder', 'back', 'glute', 'calf', 'ab '],
  back: ['bicep', 'tricep', 'leg', 'shoulder', 'chest', 'glute', 'calf', 'ab '],
  shoulders: ['bicep', 'tricep', 'leg', 'chest', 'back', 'glute', 'calf', 'ab '],
  legs: ['bicep', 'tricep', 'shoulder', 'chest', 'back', 'glute', 'ab '],
  glutes: ['bicep', 'tricep', 'shoulder', 'chest', 'back', 'calf', 'ab '],
  core: ['bicep', 'tricep', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf'],
};

const matchesMuscle = (muscleGroup, filterKey) => {
  if (!filterKey || !muscleGroup) return false;
  if (typeof filterKey !== 'string' || typeof muscleGroup !== 'string') return false;

  const filterLower = filterKey.toLowerCase().trim();
  const synonyms = MUSCLE_SYNONYMS[filterLower] || [filterLower];
  const muscleGroupLower = muscleGroup.toLowerCase().trim();

  if ((filterLower === 'biceps' || filterLower === 'triceps') && muscleGroupLower === 'arms') {
    return false;
  }

  if (synonyms.includes(muscleGroupLower)) return true;

  for (const syn of synonyms) {
    if (muscleGroupLower.startsWith(syn + ' ') || muscleGroupLower.startsWith(syn + ',')) {
      return true;
    }
  }

  return false;
};

export const exerciseMatchesMuscle = (exercise, filterKey) => {
  if (!filterKey || !exercise) return false;

  const filterLower = filterKey.toLowerCase().trim();

  if (matchesMuscle(exercise.muscle_group, filterLower)) return true;

  const namePatterns = MUSCLE_NAME_PATTERNS[filterLower] || [];
  if (namePatterns.length === 0) return false;

  const nameLower = (exercise.name || '').toLowerCase();

  const exclusiveKeywords = EXCLUSIVE_MUSCLE_KEYWORDS[filterLower] || [];
  for (const keyword of exclusiveKeywords) {
    if (nameLower.includes(keyword)) return false;
  }

  return namePatterns.some(pattern => nameLower.includes(pattern));
};

// Estimate per-exercise "volume" used to weight muscle dominance.
// Reps × sets for strength, or duration-in-minutes × sets as a proxy for
// timed work so a long plank counts comparable to a heavy set.
const exerciseVolume = (ex) => {
  const sets = Number(ex?.sets) || (Array.isArray(ex?.sets) ? ex.sets.length : 0) || 1;
  if (ex?.trackingType === 'time' || ex?.duration) {
    const seconds = Number(ex?.duration) || 30;
    return Math.max(1, Math.round((seconds / 60) * sets * 10));
  }
  const reps = typeof ex?.reps === 'number'
    ? ex.reps
    : parseFloat(ex?.reps) || 10;
  return Math.max(1, sets * reps);
};

// Walk the workout's exercises and return the dominant muscle group key,
// or null if nothing classifies. Used by the share card to pick which
// muscle map image to load.
export const getPrimaryWorkedMuscle = (exercises) => {
  if (!Array.isArray(exercises) || exercises.length === 0) return null;

  const totals = Object.create(null);
  for (const ex of exercises) {
    const volume = exerciseVolume(ex);
    for (const group of MUSCLE_GROUPS) {
      if (exerciseMatchesMuscle(ex, group)) {
        totals[group] = (totals[group] || 0) + volume;
        break; // First match wins to avoid double-counting compound lifts.
      }
    }
  }

  let best = null;
  let bestVolume = 0;
  for (const group of Object.keys(totals)) {
    if (totals[group] > bestVolume) {
      best = group;
      bestVolume = totals[group];
    }
  }
  return best;
};

// Return the full set of worked muscle groups, sorted by volume descending.
// Useful for the "Today's focus" caption that lists secondary muscles.
export const getWorkedMuscles = (exercises) => {
  if (!Array.isArray(exercises) || exercises.length === 0) return [];

  const totals = Object.create(null);
  for (const ex of exercises) {
    const volume = exerciseVolume(ex);
    for (const group of MUSCLE_GROUPS) {
      if (exerciseMatchesMuscle(ex, group)) {
        totals[group] = (totals[group] || 0) + volume;
        break;
      }
    }
  }

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => group);
};
