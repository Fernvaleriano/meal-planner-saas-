// Shared workout duration & calorie estimation helpers used by Netlify
// functions. Mirrors src/utils/workoutDuration.js so client and server
// produce consistent numbers.

const DEFAULT_WEIGHT_KG = 75;
const TRANSITION_SECONDS = 30;

// MET values from the 2011 Compendium of Physical Activities. The published
// values already account for typical rest patterns within each activity, so
// they are applied to the exercise's *total* elapsed time (work + rest)
// rather than splitting work and rest separately (which would double-count
// the rest reduction).
const MET = {
  warmup: 3.5,
  cooldown: 2.3,
  flexibility: 2.5,
  cardio_high: 8.0,
  strength_mod: 5.0
};

function parseDurationSec(value) {
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

function resolveSetCount(ex) {
  if (typeof ex.sets === 'number' && ex.sets > 0) return ex.sets;
  if (Array.isArray(ex.sets) && ex.sets.length > 0) return ex.sets.length;
  return 3;
}

function isTimeBased(ex) {
  if (ex.trackingType === 'reps') return false;
  if (ex.trackingType === 'time') return true;
  if (ex.exercise_type === 'cardio' || ex.exercise_type === 'timed') return true;
  if (typeof ex.reps === 'string' && /\d+\s*(min|s\b|sec)/i.test(ex.reps)) return true;
  return false;
}

function repSetSeconds(ex) {
  let reps = 0;
  if (typeof ex.reps === 'number') reps = ex.reps;
  else if (typeof ex.reps === 'string') {
    const range = ex.reps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) reps = parseInt(range[2], 10);
    else {
      const n = parseInt(ex.reps, 10);
      if (!isNaN(n)) reps = n;
    }
  }
  if (reps > 0) return Math.max(20, Math.min(reps * 3, 75));
  return 40;
}

function timedSetSeconds(ex) {
  return (
    parseDurationSec(Array.isArray(ex.setsData) && ex.setsData[0]?.duration) ||
    parseDurationSec(ex.duration) ||
    parseDurationSec(Array.isArray(ex.sets) && ex.sets[0]?.duration) ||
    parseDurationSec(ex.reps) ||
    30
  );
}

function exerciseSeconds(ex, isLast) {
  const numSets = resolveSetCount(ex);
  const restSeconds = ex.restSeconds || ex.rest_seconds || 60;
  const restSets = isLast ? Math.max(numSets - 1, 0) : numSets;
  const perSet = isTimeBased(ex) ? timedSetSeconds(ex) : repSetSeconds(ex);
  return { work: numSets * perSet, rest: restSets * restSeconds };
}

function getExerciseMET(ex) {
  const section = (ex.section || '').toLowerCase();
  if (section === 'warm-up' || section === 'warmup') return MET.warmup;
  if (section === 'cool-down' || section === 'cooldown') return MET.cooldown;

  const type = (ex.exercise_type || ex.type || '').toLowerCase();
  if (type === 'cardio') return MET.cardio_high;
  if (type === 'flexibility' || type === 'stretching' || type === 'mobility') return MET.flexibility;

  if (ex.trackingType === 'time') return MET.cardio_high;
  return MET.strength_mod;
}

function estimateWorkoutMinutes(exercises) {
  if (!exercises || exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (let i = 0; i < exercises.length; i++) {
    const { work, rest } = exerciseSeconds(exercises[i], i === exercises.length - 1);
    totalSeconds += work + rest;
  }
  if (exercises.length > 1) totalSeconds += (exercises.length - 1) * TRANSITION_SECONDS;
  return Math.ceil(totalSeconds / 60);
}

function estimateWorkoutCalories(exercises, weightKg = DEFAULT_WEIGHT_KG) {
  if (!exercises || exercises.length === 0) return 0;

  // kcal = MET × kg × hours, applied per exercise across its whole time
  // window (work + rest). Each exercise's MET reflects the published value
  // for that activity, which already includes typical rest cadence.
  let metSeconds = 0;
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const { work, rest } = exerciseSeconds(ex, i === exercises.length - 1);
    metSeconds += getExerciseMET(ex) * (work + rest);
  }
  // Treat between-exercise transitions as light walking (~2.5 MET).
  if (exercises.length > 1) {
    metSeconds += 2.5 * (exercises.length - 1) * TRANSITION_SECONDS;
  }
  return Math.round((metSeconds * weightKg) / 3600);
}

module.exports = {
  estimateWorkoutMinutes,
  estimateWorkoutCalories,
  DEFAULT_WEIGHT_KG
};
