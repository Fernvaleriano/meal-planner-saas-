// Shared conditioning-finisher builder for the AI workout generators.
//
// WHY THIS EXISTS
// The coach can pick a conditioning finisher (HIIT / LISS / mixed) in the AI
// modal, but it barely worked. Two things in the surrounding prompt fought it:
//   1. "CARDIO MACHINES belong ONLY in warm-up, NEVER as main" and "use EXACT
//      names from the list / NEVER invent names" — so the model usually just
//      dropped the finisher, or emitted a made-up name.
//   2. The old finisher text only gave generic hints ("burpees, kettlebell
//      swings, jump rope"), so when the model DID add one it guessed a name
//      ("Burpees") that didn't match the library ("Burpee") and came back with
//      no video (matched:false) — looking broken to the coach.
//
// THE FIX
// Pick REAL, video-backed moves straight from the coach's equipment-filtered
// library and name the EXACT DB titles in the prompt (same proven pattern the
// warm-up cardio picker already uses), and explicitly override the
// "cardio-only-in-warm-up / only-use-the-list" rules for this one block so the
// two instructions stop contradicting each other. When the library has nothing
// suitable for the selected equipment, fall back to the old generic text (so
// behavior is never worse than before).

const { exerciseMatchesEquipment } = require('./equipment-filter');

// Real library moves to offer, in priority order. Anchored so we only match the
// clean cardio versions (e.g. "Jump Rope basic jump", not "Jump Rope row" which
// is a back exercise). Case-insensitive because the same move exists in the DB
// under a few casings — the pick loop de-dupes by lowercased name.
const HIIT_PATTERNS = [
  /^burpee$/i,
  /^mountain climbers$/i,
  /^kettlebell swing$/i,
  /^jump rope basic jump$/i,
  /^jump squats bodyweight$/i,
  /^half burpees$/i,
  /^high knees$/i,
  /^jumping jack$/i,
];

// Steady-state options — prefer the "Normal Speed" machine variants.
const LISS_PATTERNS = [
  /^gym rowing machine normal speed$/i,
  /^gym elliptical machine normal speed$/i,
  /^assault airbike normal speed$/i,
  /^jogging$/i,
];

function hasVideo(ex) {
  return !!(ex && (ex.video_url || ex.animation_url));
}

// Pull up to `limit` real exercise names from the pool that (a) have a video,
// (b) match one of the priority patterns, and (c) are allowed by the coach's
// selected equipment. De-dupes by lowercased name so the same move under two
// casings isn't listed twice.
function pickFinishers(pool, equipment, patterns, limit) {
  const chosen = [];
  const seen = new Set();
  for (const re of patterns) {
    if (chosen.length >= limit) break;
    for (const ex of (pool || [])) {
      const name = ex && ex.name ? String(ex.name).trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      if (!hasVideo(ex)) continue;
      if (!re.test(name)) continue;
      if (!exerciseMatchesEquipment(ex, equipment)) continue;
      chosen.push(name);
      seen.add(key);
      if (chosen.length >= limit) break;
    }
  }
  return chosen;
}

function nameList(names) {
  return names.map(n => `"${n}"`).join(', ');
}

// Header that neutralizes the two rules that otherwise suppress/break the
// finisher. Applies to the finisher block ONLY.
const OVERRIDE_HEADER =
  '\n=== CONDITIONING FINISHER (MANDATORY — for THIS block only, this OVERRIDES the "cardio machines belong only in the warm-up" rule) ===\n' +
  'Add the finisher as the LAST item(s) of the workout — AFTER the main work and BEFORE the cool-down stretches. Every finisher exercise MUST have "phase": "conditioning" (NOT "isWarmup"). Copy the exercise name EXACTLY as written below (these are real library moves that have videos) — do NOT rename, pluralize, or invent.';

// Builds the conditioning-finisher prompt block.
//   conditioningStyle: 'none' | 'hiit' | 'liss' | 'mixed'
//   pool:              video-backed, injury-filtered exercise rows
//   equipment:         coach's selected equipment array
// Returns '' when no finisher is requested.
function buildConditioningFinisher({ conditioningStyle, pool, equipment }) {
  if (!conditioningStyle || conditioningStyle === 'none') return '';

  const hiit = pickFinishers(pool, equipment, HIIT_PATTERNS, 5);
  const liss = pickFinishers(pool, equipment, LISS_PATTERNS, 3);

  if (conditioningStyle === 'hiit') {
    const opts = hiit.length
      ? `Use 1-3 of these EXACT moves, reps in TIME format ("30s"): ${nameList(hiit)}.`
      : `Use bodyweight or kettlebell intervals (burpees, mountain climbers, kettlebell swings, jump rope), reps in TIME format ("30s").`;
    return `${OVERRIDE_HEADER}\nHIIT finisher — 4-8 rounds of 30s work / 30s rest. ${opts}`;
  }

  if (conditioningStyle === 'liss') {
    const opts = liss.length
      ? `Use ONE of these EXACT moves: ${nameList(liss)}.`
      : `Use steady machine cardio (row, elliptical, easy bike) or an easy jog.`;
    return `${OVERRIDE_HEADER}\nLISS finisher — one steady 10-15 min bout at RPE 5-6, reps in TIME format ("12 min"). ${opts}`;
  }

  if (conditioningStyle === 'mixed') {
    const hiitPart = hiit.length
      ? `on some days a HIIT finisher (4-8 rounds of 30s/30s) using one of: ${nameList(hiit)}`
      : `on some days a short HIIT finisher (burpees, mountain climbers, jump rope)`;
    const lissPart = liss.length
      ? `on other days a 10-15 min LISS bout (RPE 5-6) using one of: ${nameList(liss)}`
      : `on other days a 10-15 min easy steady cardio bout`;
    return `${OVERRIDE_HEADER}\nMixed conditioning — alternate across days: ${hiitPart}; ${lissPart}. Reps in TIME format.`;
  }

  return '';
}

module.exports = { buildConditioningFinisher, HIIT_PATTERNS, LISS_PATTERNS };
