// Shared workout progression engine
// Used by both ExerciseDetailModal and GuidedWorkoutModal for consistent coaching suggestions

// Effort level options (user-friendly RIR / RPE)
export const EFFORT_OPTIONS = [
  { value: 'easy', label: 'Easy', detail: '4+ left', color: '#22c55e' },
  { value: 'moderate', label: 'Moderate', detail: '2-3 left', color: '#eab308' },
  { value: 'hard', label: 'Hard', detail: '1 left', color: '#f97316' },
  { value: 'maxed', label: 'All Out', detail: '0 left', color: '#ef4444' },
];

// Map effort labels to numeric RIR values for weighted averaging
export const EFFORT_TO_RIR = { easy: 4, moderate: 2.5, hard: 1, maxed: 0 };

// Estimate 1RM using Brzycki formula
export const estimate1RM = (weight, reps) => {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (36 / (37 - Math.min(reps, 36)));
};

// Common compound exercise name patterns
const COMPOUND_PATTERNS = [
  'squat', 'deadlift', 'bench press', 'overhead press', 'military press',
  'barbell row', 'bent over row', 'pull-up', 'pullup', 'chin-up', 'chinup',
  'dip', 'lunge', 'leg press', 'hip thrust', 'clean', 'snatch',
  'push press', 'thruster', 'good morning', 'rack pull', 'front squat',
  'romanian deadlift', 'rdl', 'sumo deadlift', 'pendlay row', 't-bar row',
  'incline press', 'decline press', 'close grip bench', 'hack squat',
  'bulgarian split squat', 'step up', 'farmer', 'turkish get up'
];

// Parse reps from string or number
export const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
  }
  return 12;
};

// Parse sets data safely
export const parseSetsData = (session) => {
  try {
    const s = typeof session.setsData === 'string'
      ? JSON.parse(session.setsData) : (session.setsData || []);
    return Array.isArray(s) ? s : [];
  } catch { return []; }
};

// Get max weight from a set array
export const getMaxWeight = (sets) => sets.reduce((max, s) => Math.max(max, s.weight || 0), 0);

// Detect if exercise is compound based on name or explicit flag
export const isCompoundExercise = (exercise) => {
  if (exercise?.is_compound !== undefined) return !!exercise.is_compound;
  const name = (exercise?.name || '').toLowerCase();
  return COMPOUND_PATTERNS.some(p => name.includes(p));
};

// Get weight increment based on compound/isolation and unit
export const getWeightIncrement = (exercise, weightUnit) => {
  const compound = isCompoundExercise(exercise);
  return compound
    ? (weightUnit === 'kg' ? 2.5 : 5)
    : (weightUnit === 'kg' ? 1.25 : 2.5);
};

// Round weight to the nearest realistic gym increment
// Ensures we never suggest weights like 29.5kg that don't exist
export const roundToGymWeight = (weight, increment) => {
  if (weight <= 0) return 0;
  return Math.round(weight / increment) * increment;
};

// --- Effort inference from actual performance vs recommendation ---
// If no explicit effort was logged, infer it from what they actually did
export const inferEffort = (actualReps, actualWeight, recommendedReps, recommendedWeight) => {
  if (!actualReps || !recommendedReps) return null;

  const weightDiff = actualWeight - recommendedWeight;
  const repDiff = actualReps - recommendedReps;

  // Did more weight AND more reps → easy
  if (weightDiff > 0 && repDiff >= 0) return 'easy';
  // Did more reps at same weight → easy/moderate
  if (weightDiff === 0 && repDiff >= 3) return 'easy';
  if (weightDiff === 0 && repDiff >= 1) return 'moderate';
  // Matched exactly → moderate/hard
  if (weightDiff === 0 && repDiff === 0) return 'hard';
  // Did fewer reps at same weight → hard/maxed
  if (weightDiff === 0 && repDiff < 0) return 'maxed';
  // Dropped weight → maxed
  if (weightDiff < 0) return 'maxed';
  // Increased weight but fewer reps (normal) → moderate
  if (weightDiff > 0 && repDiff < 0) return 'moderate';

  return null;
};

// --- Weighted RIR average from effort ratings on sets ---
export const getWeightedEffort = (sets) => {
  const setsWithEffort = sets.filter(s => s.effort && EFFORT_TO_RIR[s.effort] !== undefined);
  if (setsWithEffort.length === 0) return null;

  let totalWeight = 0;
  let weightedSum = 0;
  setsWithEffort.forEach((s, idx) => {
    // Last set counts 1.5x — most accurate effort gauge
    const w = idx === setsWithEffort.length - 1 ? 1.5 : 1;
    weightedSum += EFFORT_TO_RIR[s.effort] * w;
    totalWeight += w;
  });
  const avgRIR = weightedSum / totalWeight;

  // Map back to effort bucket
  if (avgRIR >= 3.5) return 'easy';
  if (avgRIR >= 1.75) return 'moderate';
  if (avgRIR >= 0.5) return 'hard';
  return 'maxed';
};

// --- Plateau detection via estimated 1RM ---
export const detectPlateau = (sessions, parseSets) => {
  if (sessions.length < 2) return false;

  const session1RMs = sessions.slice(0, 4).map(session => {
    const sets = parseSets(session);
    return sets.reduce((max, s) => Math.max(max, estimate1RM(s.weight || 0, s.reps || 0)), 0);
  }).filter(rm => rm > 0);

  if (session1RMs.length >= 3) {
    return session1RMs[0] <= session1RMs[2] * 1.02;
  } else if (session1RMs.length >= 2) {
    return session1RMs[0] <= session1RMs[1] * 1.01;
  }
  return false;
};

/**
 * Main progression engine — single source of truth for both modals.
 *
 * @param {Object} params
 * @param {Object[]} params.previousSessions - History sessions (most recent first), excluding today
 * @param {Object} params.exercise - Exercise object with name, reps, sets, is_compound, etc.
 * @param {string} params.weightUnit - 'kg' or 'lbs'
 * @param {Object|null} params.lastRecommendation - Previous recommendation (for effort inference)
 * @returns {Object|null} { sets, reps, weight, reasoning, plateau, lastSession, effort }
 */
export const generateProgression = ({ previousSessions, exercise, weightUnit, lastRecommendation }) => {
  if (!previousSessions || previousSessions.length === 0) return null;

  // --- Parse last session ---
  let lastSession = previousSessions[0];
  let lastSets = parseSetsData(lastSession);
  let lastMaxWeight = getMaxWeight(lastSets);

  // Skip 0-weight sessions (warm-up or unrecorded) if older sessions have real weight
  if (lastMaxWeight <= 0 && previousSessions.length > 1) {
    const sessionWithWeight = previousSessions.find(s => getMaxWeight(parseSetsData(s)) > 0);
    if (sessionWithWeight) {
      lastSession = sessionWithWeight;
      lastSets = parseSetsData(lastSession);
      lastMaxWeight = getMaxWeight(lastSets);
    }
  }

  const lastMaxReps = lastSets.reduce((max, s) => Math.max(max, s.reps || 0), 0);
  const lastNumSets = lastSets.length || 3;

  if (lastMaxWeight <= 0 && lastMaxReps <= 0) return null;

  // --- Effort determination ---
  // Priority 1: Explicit effort ratings logged on sets (from Guided Workout)
  let effectiveEffort = getWeightedEffort(lastSets);

  // Priority 2: RPE data (from ExerciseDetail or manual logging)
  if (!effectiveEffort) {
    const rpeValues = lastSets.map(s => s.rpe).filter(r => r != null && r >= 6);
    if (rpeValues.length > 0) {
      const avgRpe = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
      if (avgRpe >= 9.5) effectiveEffort = 'maxed';
      else if (avgRpe >= 8) effectiveEffort = 'hard';
      else if (avgRpe >= 6.5) effectiveEffort = 'moderate';
      else effectiveEffort = 'easy';
    }
  }

  // Priority 3: Infer effort from actual vs recommended performance
  if (!effectiveEffort && lastRecommendation) {
    effectiveEffort = inferEffort(
      lastMaxReps, lastMaxWeight,
      lastRecommendation.reps, lastRecommendation.weight
    );
  }

  // --- Exercise properties ---
  const weightIncrement = getWeightIncrement(exercise, weightUnit);
  // Use coach-prescribed reps if available, otherwise base range on what client actually did
  const hasPrescribedReps = exercise?.reps != null && exercise.reps !== '' && exercise.reps !== 0;
  const prescribedReps = hasPrescribedReps ? parseReps(exercise.reps) : lastMaxReps;
  const repRangeTop = prescribedReps + 2;

  // --- Plateau detection ---
  const plateauDetected = detectPlateau(previousSessions, parseSetsData);

  // --- Days since last session ---
  const lastDate = lastSession.workoutDate;
  const lastDateObj = lastDate ? new Date(lastDate + 'T12:00:00') : null;
  const daysSinceLast = lastDateObj
    ? Math.round((new Date() - lastDateObj) / (1000 * 60 * 60 * 24))
    : null;

  // --- Format date ---
  const dateLabel = lastDateObj
    ? lastDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'last session';

  // --- Prescribed sets ---
  const prescribedSets = Array.isArray(exercise?.sets) ? exercise.sets.length
    : (typeof exercise?.sets === 'number' && exercise.sets > 0 ? exercise.sets : lastNumSets);

  // === PROGRESSIVE OVERLOAD RECOMMENDATION ===
  let recommendedReps = lastMaxReps;
  let recommendedWeight = lastMaxWeight;
  let recommendedSets = prescribedSets;
  let reasoning = '';

  if (plateauDetected) {
    // Plateau: add volume or deload
    if (lastNumSets < 5) {
      recommendedSets = lastNumSets + 1;
      reasoning = `Your strength hasn't improved recently. Adding an extra set to break through the plateau.`;
    } else {
      recommendedWeight = roundToGymWeight(lastMaxWeight * 0.9, weightIncrement);
      recommendedReps = Math.max(lastMaxReps - 2, prescribedReps - 2);
      reasoning = `Plateau detected — time to deload. Drop to ${recommendedWeight}${weightUnit} and rebuild.`;
    }
  } else if (effectiveEffort === 'easy') {
    // 4+ RIR — push harder
    if (lastMaxReps >= repRangeTop) {
      recommendedWeight = lastMaxWeight + weightIncrement;
      // Practical rep drop: subtract 2 from actual, not drop to range bottom
      recommendedReps = Math.max(lastMaxReps - 2, prescribedReps - 2);
      reasoning = `Easy at ${lastMaxReps} reps — you've earned a weight increase! Drop to ${recommendedReps} reps and build back up.`;
    } else {
      recommendedReps = Math.min(lastMaxReps + 2, repRangeTop);
      reasoning = `Felt easy — push for ${recommendedReps} reps. Once you hit ${repRangeTop}, we'll increase the weight.`;
    }
  } else if (effectiveEffort === 'moderate') {
    // 2-3 RIR — steady progress
    if (lastMaxReps >= repRangeTop) {
      recommendedWeight = lastMaxWeight + weightIncrement;
      recommendedReps = Math.max(lastMaxReps - 2, prescribedReps - 2);
      reasoning = `Hit ${lastMaxReps} reps with room to spare. Time to add +${weightIncrement}${weightUnit} and aim for ${recommendedReps} reps.`;
    } else {
      recommendedReps = lastMaxReps + 1;
      reasoning = `Solid effort. Add one more rep — aiming for ${recommendedReps}. Top of range is ${repRangeTop}.`;
    }
  } else if (effectiveEffort === 'hard') {
    // 1 RIR — near limit
    if (lastMaxReps >= repRangeTop) {
      recommendedWeight = lastMaxWeight + weightIncrement;
      recommendedReps = Math.max(lastMaxReps - 2, prescribedReps - 2);
      reasoning = `Tough but you hit ${repRangeTop}+ reps. Ready for +${weightIncrement}${weightUnit} at ${recommendedReps} reps.`;
    } else {
      recommendedReps = lastMaxReps;
      reasoning = `That was challenging. Match ${lastMaxReps} reps and focus on form before pushing further.`;
    }
  } else if (effectiveEffort === 'maxed') {
    // 0 RIR — at failure
    if (lastMaxReps <= (prescribedReps - 2)) {
      recommendedWeight = Math.max(0, lastMaxWeight - weightIncrement);
      recommendedReps = lastMaxReps + 2;
      reasoning = `You went all out at low reps. Drop ${weightIncrement}${weightUnit} and aim for ${recommendedReps} reps with better control.`;
    } else {
      recommendedReps = lastMaxReps;
      reasoning = `You pushed to the max. Hold at ${lastMaxReps} reps until it feels more manageable.`;
    }
  } else {
    // No effort data at all — simple conservative progression
    if (lastMaxReps >= repRangeTop) {
      recommendedWeight = lastMaxWeight + weightIncrement;
      // Practical: drop by 2 reps, not to range bottom
      recommendedReps = Math.max(lastMaxReps - 2, prescribedReps - 2);
      reasoning = `You hit ${lastMaxReps} reps — time to increase weight by +${weightIncrement}${weightUnit} and aim for ${recommendedReps} reps.`;
    } else {
      recommendedReps = lastMaxReps + 1;
      reasoning = `Aim for ${recommendedReps} reps. Once you reach ${repRangeTop}, we'll bump the weight.`;
    }
  }

  // --- Extended context for long gaps ---
  if (daysSinceLast !== null && daysSinceLast >= 14) {
    // 2+ weeks off — suggest conservative approach
    recommendedWeight = roundToGymWeight(lastMaxWeight * 0.9, weightIncrement);
    recommendedReps = lastMaxReps;
    reasoning = `It's been ${daysSinceLast} days since your last session. Ease back in at ${recommendedWeight}${weightUnit} and match your previous reps.`;
  }

  const effortLabel = effectiveEffort === 'easy' ? 'felt easy'
    : effectiveEffort === 'moderate' ? 'felt moderate'
    : effectiveEffort === 'hard' ? 'felt hard'
    : effectiveEffort === 'maxed' ? 'went all out' : null;

  // Final safety: ensure recommended weight lands on a real gym increment
  recommendedWeight = roundToGymWeight(recommendedWeight, weightIncrement);

  return {
    sets: recommendedSets,
    reps: recommendedReps,
    weight: recommendedWeight,
    reasoning,
    plateau: plateauDetected,
    effort: effectiveEffort,
    lastSession: {
      reps: lastMaxReps,
      weight: lastMaxWeight,
      sets: lastNumSets,
      date: dateLabel,
      effort: effectiveEffort,
      effortLabel,
    },
    progressMessage: `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} ${weightUnit}${effortLabel ? ` (${effortLabel})` : ''}${plateauDetected ? ' — plateau detected' : ''}.`,
  };
};
