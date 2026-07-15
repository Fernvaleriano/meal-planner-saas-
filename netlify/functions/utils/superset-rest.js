// ─── Superset rest normalization ──────────────────────────────────────────────
// Inside a superset (or circuit), the exercises are performed back-to-back — you
// finish one move and flow straight into the next. The only real rest comes
// AFTER the last move of the group, before you loop back and start the next
// round. So only the LAST exercise in a superset group should carry the full
// recovery rest (90s etc). The earlier moves in the group get a short transition
// rest (10-30s) — just enough to walk to the next station.
//
// Without this, the AI would put a 90s rest on the FIRST exercise of a pair,
// which made the guided-workout timer sit the client down for a minute and a
// half between the two paired moves — defeating the point of a superset. This
// pass enforces the correct pattern deterministically, regardless of what the
// model returns, on both the member-facing and coach-facing AI generators.

const SUPERSET_TRANSITION_REST = 15; // seconds between paired moves in a group
const SUPERSET_REST_MIN = 10;
const SUPERSET_REST_MAX = 30;

// Normalize rest within one ordered array of exercises (a single workout day).
// Superset pairs are placed consecutively and share the same supersetGroup
// letter, so an exercise is "mid-group" when the very next exercise is in the
// same group. Mid-group moves get the short transition rest; the last move of
// the group (and all straight sets) are left untouched.
function normalizeSupersetRestInExercises(exercises) {
  if (!Array.isArray(exercises)) return exercises;
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (!ex || !ex.isSuperset || !ex.supersetGroup) continue;
    const next = exercises[i + 1];
    const midGroup = !!next && next.isSuperset && next.supersetGroup === ex.supersetGroup;
    if (!midGroup) continue; // last / only move of the group keeps its full rest
    const cur = Number(ex.restSeconds);
    // Respect a value the model already put in the short range; otherwise snap
    // an out-of-range value (e.g. the classic 90s) down to a quick transition.
    if (!(cur >= SUPERSET_REST_MIN && cur <= SUPERSET_REST_MAX)) {
      ex.restSeconds = SUPERSET_TRANSITION_REST;
    }
  }
  return exercises;
}

// Normalize an entire program's weeks[].workouts[].exercises[] structure.
function normalizeSupersetRest(weeks) {
  if (!Array.isArray(weeks)) return weeks;
  for (const week of weeks) {
    for (const workout of (week.workouts || [])) {
      normalizeSupersetRestInExercises(workout.exercises);
    }
  }
  return weeks;
}

module.exports = {
  normalizeSupersetRest,
  normalizeSupersetRestInExercises,
  SUPERSET_TRANSITION_REST,
  SUPERSET_REST_MIN,
  SUPERSET_REST_MAX
};
