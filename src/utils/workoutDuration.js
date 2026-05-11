/**
 * Shared workout duration & calorie estimation utilities.
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

/**
 * Resolve the duration of a single set for a time-based exercise.
 * Returns seconds.
 */
function resolveTimedSetSeconds(ex) {
  return (
    parseDurationToSeconds(Array.isArray(ex.setsData) && ex.setsData[0]?.duration) ||
    parseDurationToSeconds(ex.duration) ||
    parseDurationToSeconds(Array.isArray(ex.sets) && ex.sets[0]?.duration) ||
    parseDurationToSeconds(ex.reps) ||
    30
  );
}

/**
 * Compute work/rest seconds for a single exercise.
 * `isLast` controls whether the trailing inter-set rest is included
 * (skipped on the final exercise to avoid counting rest after the last set).
 */
function exerciseSeconds(ex, isLast) {
  const numSets = resolveSetCount(ex);
  const restSeconds = ex.restSeconds || ex.rest_seconds || 60;
  const restSets = isLast ? Math.max(numSets - 1, 0) : numSets;

  const perSet = isTimeBased(ex) ? resolveTimedSetSeconds(ex) : estimateSetSeconds(ex);
  return {
    work: numSets * perSet,
    rest: restSets * restSeconds
  };
}

// ---------------------------------------------------------------------------
// Main duration estimation
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
    const { work, rest } = exerciseSeconds(exercises[i], i === exercises.length - 1);
    totalSeconds += work + rest;
  }

  if (exercises.length > 1) {
    totalSeconds += (exercises.length - 1) * TRANSITION_SECONDS;
  }

  return Math.ceil(totalSeconds / 60);
}

// ---------------------------------------------------------------------------
// Calorie estimation (MET-based)
// ---------------------------------------------------------------------------

// Default body weight when none is supplied. ~75 kg ≈ 165 lb is a reasonable
// generic-adult assumption that lines up with published MET tables.
const DEFAULT_WEIGHT_KG = 75;
const LBS_TO_KG = 0.45359237;

/**
 * Resolve a client's body weight in kilograms from their profile record.
 * Returns `undefined` when no usable weight is stored, in which case
 * `estimateWorkoutCalories` will fall back to its default body weight.
 *
 * The `weight` column on `clients` stores the value in the user's chosen
 * unit (kg if `unit_preference === 'metric'`, otherwise pounds).
 */
export function clientWeightKg(clientData) {
  if (!clientData) return undefined;
  const raw = parseFloat(clientData.weight);
  if (!raw || raw <= 0 || !isFinite(raw)) return undefined;
  const isMetric = clientData.unit_preference === 'metric';
  return isMetric ? raw : raw * LBS_TO_KG;
}

// MET values sourced from the 2011 Compendium of Physical Activities.
//
// IMPORTANT: these are applied to WORK seconds only — between-set rest gets
// MET.rest and between-exercise transitions get MET.transition. Earlier
// versions multiplied the activity MET by the entire elapsed time (work +
// rest), which over-credited rest periods at the activity rate and produced
// physiologically impossible totals (e.g. >20 kcal/min sustained) for any
// workout with substantial inter-set rest. Splitting work and rest matches
// how heart-rate-based trackers (Apple Watch, Fitbit) behave.
const MET = {
  // Section-based defaults
  warmup: 4.0,            // dynamic warm-up: jumping jacks, arm circles, light jog
  cooldown: 2.3,          // static stretching, easy walking
  flexibility: 2.5,       // yoga, mobility flows, foam rolling

  // Cardio / conditioning (applied to work intervals)
  cardio_moderate: 5.5,   // light bodyweight circuits, easy bag work
  cardio_high: 8.0,       // HIIT, vigorous intervals, jump rope
  cardio_vigorous: 10.0,  // sprints, burpees, kickboxing/martial-arts rounds

  // Strength (applied to time under load)
  strength_light: 3.5,    // resistance training, light effort, high reps
  strength_mod: 5.0,      // standard resistance training, 8-12 reps
  strength_heavy: 6.0,    // heavy compound lifts, ≤6 reps

  // Non-active periods inside a workout
  rest: 1.5,              // seated/standing recovery between sets
  transition: 2.5         // walking between exercises / setting up
};

// Names that hint at vigorous sport-specific work even when only tagged as
// generic "cardio" or "time"-tracked. Conservative list — false positives
// just nudge a single exercise from MET 8 → 10.
const VIGOROUS_NAME_RE = /\b(box|punch|kick|muay|sprint|jump\s*rope|burpee|battle\s*rope|sledgehammer|plyo)/i;

/**
 * Pick a MET value for an exercise based on its section, type, tracking,
 * and (as a tiebreaker) its name and rep target.
 */
function getExerciseMET(ex) {
  const section = (ex.section || '').toLowerCase();
  if (section === 'warm-up' || section === 'warmup') return MET.warmup;
  if (section === 'cool-down' || section === 'cooldown') return MET.cooldown;

  const type = (ex.exercise_type || ex.type || '').toLowerCase();
  if (type === 'flexibility' || type === 'stretching' || type === 'mobility') {
    return MET.flexibility;
  }

  const name = ex.name || '';
  const looksVigorous = VIGOROUS_NAME_RE.test(name);

  // Cardio / timed circuit work.
  if (type === 'cardio' || type === 'interval' || ex.trackingType === 'time') {
    if (looksVigorous) return MET.cardio_vigorous;
    return MET.cardio_high;
  }

  // Strength: pick by rep target. Heavy (≤6 reps), light (≥15 reps or
  // bodyweight high-rep), moderate otherwise.
  const reps = parseRepsToNumber(ex.reps);
  if (reps > 0) {
    if (reps <= 6) return MET.strength_heavy;
    if (reps >= 15) return MET.strength_light;
  }
  return MET.strength_mod;
}

// Clamp body weight to a sane range so malformed profile data (e.g., a value
// in pounds saved while unit_preference is "metric") can't blow up the result.
function clampWeightKg(weightKg) {
  const w = weightKg && weightKg > 0 && isFinite(weightKg) ? weightKg : DEFAULT_WEIGHT_KG;
  return Math.max(30, Math.min(200, w));
}

/**
 * Estimate calories burned for a workout using the MET formula:
 *   kcal = MET × bodyWeightKg × hours
 *
 * The activity MET is applied to work seconds only. Rest between sets gets
 * MET.rest (~1.5, seated/standing recovery); transitions between exercises
 * get MET.transition (~2.5, light walking).
 *
 * @param {Array} exercises – flat array of exercise objects
 * @param {Object} [options]
 * @param {number} [options.weightKg] – body weight in kg (defaults to 75)
 * @returns {number} estimated kilocalories (rounded)
 */
export function estimateWorkoutCalories(exercises, options = {}) {
  if (!exercises || exercises.length === 0) return 0;
  const weight = clampWeightKg(options.weightKg);

  let metSeconds = 0;
  let totalSeconds = 0;
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const { work, rest } = exerciseSeconds(ex, i === exercises.length - 1);
    metSeconds += getExerciseMET(ex) * work;
    metSeconds += MET.rest * rest;
    totalSeconds += work + rest;
  }
  if (exercises.length > 1) {
    const transitionSeconds = (exercises.length - 1) * TRANSITION_SECONDS;
    metSeconds += MET.transition * transitionSeconds;
    totalSeconds += transitionSeconds;
  }

  const kcal = (metSeconds * weight) / 3600;
  // Final safety cap. Even elite athletes rarely sustain >18 kcal/min for a
  // half-hour-plus workout. This guards against pathological exercise data
  // (e.g., a single "exercise" with a thousand sets) producing a runaway total.
  const cap = (totalSeconds / 60) * 18;
  return Math.round(Math.min(kcal, cap));
}
