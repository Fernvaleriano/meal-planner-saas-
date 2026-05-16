// Shared "evidence of effort" logic for the React client app.
//
// Coaching philosophy (ported from client-profile.html): ANY genuine evidence
// of effort = worked out. We do NOT punish imperfect logging — if a client
// showed up and tried, they get credit.
//
// A day counts as worked out when ANY of these are true:
//   1. A gym check-in photo exists for that date
//   2. A non-skipped log has >= 1 recorded set
//   3. A non-skipped log has >= 1 checked-off (completed) exercise
//
// Only excluded: status === 'skipped', no log at all, or a log that exists
// but has 0 sets AND 0 completed exercises.

// setsData may arrive as a JSON string or an array.
export function parseSets(sd) {
  if (typeof sd === 'string') {
    try { sd = JSON.parse(sd); } catch { sd = []; }
  }
  return Array.isArray(sd) ? sd : [];
}

// Set/exercise quality for a single workout log (expects log.exercises[] with
// sets_data/setsData). Falls back to the denormalized total_sets when exercise
// rows were not expanded by the caller.
export function computeLogQuality(log) {
  let totalSets = 0;
  let completedSets = 0;
  let completedExercises = 0;

  const exs = Array.isArray(log?.exercises) ? log.exercises : [];
  for (const ex of exs) {
    const sets = parseSets(ex?.sets_data ?? ex?.setsData);
    let exHasCompleted = false;
    for (const s of sets) {
      totalSets++;
      if (s && (s.completed === true || s._completed === true)) {
        completedSets++;
        exHasCompleted = true;
      }
    }
    if (exHasCompleted) completedExercises++;
  }

  if (totalSets === 0 && Number(log?.total_sets) > 0) {
    totalSets = Number(log.total_sets);
  }

  return { totalSets, completedSets, completedExercises };
}

// True when a single workout log shows effort: NOT skipped AND it has at least
// one recorded set OR at least one checked-off exercise.
export function logHasEffort(log) {
  if (!log || log.status === 'skipped') return false;
  const q = computeLogQuality(log);
  return q.totalSets > 0 || q.completedExercises > 0;
}

// Build the Set of 'YYYY-MM-DD' strings that count as worked out, from workout
// logs and gym check-ins. Either argument may be null/undefined.
export function buildWorkedOutDates(logs, gymProofs) {
  const dates = new Set();
  (Array.isArray(logs) ? logs : []).forEach((w) => {
    if (w && w.workout_date && logHasEffort(w)) dates.add(w.workout_date);
  });
  (Array.isArray(gymProofs) ? gymProofs : []).forEach((p) => {
    if (p && p.proof_date) dates.add(p.proof_date);
  });
  return dates;
}

// Lookup helper: does this date string count as worked out?
export function isWorkedOut(dateStr, workedOutDates) {
  return !!dateStr && workedOutDates instanceof Set && workedOutDates.has(dateStr);
}
