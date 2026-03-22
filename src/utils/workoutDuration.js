/**
 * Shared workout duration estimation utilities.
 *
 * Centralises the calculation that was previously duplicated across
 * Workouts.jsx, WorkoutBuilder.jsx, CreateWorkoutModal.jsx, and
 * useWorkoutAutosave.js.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a duration value ("5 min", "30s", 45, "45s hold", etc.) to seconds. */
export function parseDurationToSeconds(value) {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const minMatch = value.match(/(\d+)\s*min/i);
    if (minMatch) return parseInt(minMatch[1], 10) * 60;
    const secMatch = value.match(/(\d+)\s*s/i);
    if (secMatch) return parseInt(secMatch[1], 10);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
}

/** Parse a reps value to a number (handles strings like "12" or "8-12"). */
function parseRepsToNumber(reps) {
  if (typeof reps === 'number' && reps > 0) return reps;
  if (typeof reps === 'string') {
    // For ranges like "8-12", use the higher end
    const rangeMatch = reps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) return parseInt(rangeMatch[2], 10);
    const num = parseInt(reps, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
}

/** Resolve how many sets an exercise has. */
function resolveSetCount(ex) {
  if (typeof ex.sets === 'number' && ex.sets > 0) return ex.sets;
  if (Array.isArray(ex.sets) && ex.sets.length > 0) return ex.sets.length;
  return 3; // sensible default
}

/** Detect whether an exercise should be treated as time-based. */
function isTimeBased(ex) {
  // trackingType is authoritative — if explicitly 'reps', never treat as timed
  if (ex.trackingType === 'reps') return false;
  if (ex.trackingType === 'time') return true;
  if (ex.exercise_type === 'cardio' || ex.exercise_type === 'timed') return true;
  if (typeof ex.reps === 'string' && /\d+\s*(min|s\b|sec)/i.test(ex.reps)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Per-set time estimate for rep-based exercises
// ---------------------------------------------------------------------------

/**
 * Estimate seconds spent under load for a single rep-based set.
 *
 * Instead of a flat 40 s, scale with the rep count:
 *   ~3 s per rep (accounts for eccentric + concentric + brief pause)
 *   with a floor of 20 s and a ceiling of 75 s.
 *
 * Falls back to 40 s when rep count is unknown.
 */
function estimateSetSeconds(ex) {
  const reps = parseRepsToNumber(ex.reps);
  if (reps > 0) {
    const raw = reps * 3;
    return Math.max(20, Math.min(raw, 75));
  }
  return 40; // default when reps unknown
}

// ---------------------------------------------------------------------------
// Main estimation
// ---------------------------------------------------------------------------

const TRANSITION_SECONDS = 30; // time moving between exercises

/**
 * Estimate total workout duration in minutes.
 *
 * @param {Array} exercises – flat array of exercise objects
 * @returns {number} estimated minutes (rounded up)
 */
export function estimateWorkoutMinutes(exercises) {
  if (!exercises || exercises.length === 0) return 0;

  let totalSeconds = 0;

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const numSets = resolveSetCount(ex);
    const restSeconds = ex.restSeconds || ex.rest_seconds || 60;
    const isLast = i === exercises.length - 1;

    if (isTimeBased(ex)) {
      // Use explicit duration when available
      const setDuration =
        parseDurationToSeconds(ex.duration) ||
        parseDurationToSeconds(Array.isArray(ex.sets) && ex.sets[0]?.duration) ||
        parseDurationToSeconds(ex.reps) ||
        30;
      // Rest between sets + rest after final set (except last exercise)
      const restSets = isLast ? Math.max(numSets - 1, 0) : numSets;
      totalSeconds += numSets * setDuration + restSets * restSeconds;
    } else {
      const perSet = estimateSetSeconds(ex);
      // Rest between sets + rest after final set (except last exercise)
      const restSets = isLast ? Math.max(numSets - 1, 0) : numSets;
      totalSeconds += numSets * perSet + restSets * restSeconds;
    }
  }

  // Transition time between exercises (equipment setup, moving stations)
  if (exercises.length > 1) {
    totalSeconds += (exercises.length - 1) * TRANSITION_SECONDS;
  }

  return Math.ceil(totalSeconds / 60);
}

/**
 * Very rough calorie estimate.  5 kcal / min as a baseline.
 */
export function estimateWorkoutCalories(exercises) {
  return Math.round(estimateWorkoutMinutes(exercises) * 5);
}
