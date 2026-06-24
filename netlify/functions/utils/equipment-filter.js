// Shared equipment filtering for the AI workout generators.
//
// WHY THIS EXISTS
// The exercises.equipment column is unreliable. Hundreds of clearly
// equipment-based moves are mistagged (e.g. "Alternate biceps curl standing
// dumbbells", "Landmine Chest Press", "Lat Pull Down Wide Grip", "Suspension
// Trainer ... Inverted Row", "Leg Press Wide High Stance" are all tagged
// equipment='bodyweight'), and ~100 rows have a blank column even though the
// name names the gear ("Kickstand Trap Bar Romanian Deadlift", "Resistance band
// face pull"). The old filter trusted the column alone: blank/'bodyweight' ⇒
// bodyweight. Result — coaches who picked "Bodyweight only" still got barbell,
// band, suspension-trainer and pull-up exercises.
//
// The fix: treat the exercise NAME as the source of truth for which gear a move
// needs, and use the column only as a fallback. Matching is symmetric — a
// dumbbell move mistagged "bodyweight" still matches when "dumbbell" is picked,
// and never counts as bodyweight when only "bodyweight" is picked.

// Selectable equipment tokens (these line up with the AI-generator checkboxes
// plus the two extra tokens the backend already understood: bands, pullup_bar).
// Each maps to name patterns that imply that piece of equipment.
const GEAR_NAME_PATTERNS = {
  barbell:    /\b(barbell|trap[\s-]?bar|hex[\s-]?bar|ez[\s-]?bar|landmine|smith)\b/i,
  dumbbell:   /\bdumbbell|\bdumbell\b/i,
  kettlebell: /\bkettlebell|\bkettle[\s-]?bell\b/i,
  cable:      /\b(cable|pulldown|pull[\s-]?down|lat[\s-]?pull|pulley)\b/i,
  machine:    /\b(machine|leg[\s-]?press|leg[\s-]?extension|leg[\s-]?curl|pec[\s-]?deck|hack[\s-]?squat|hammer[\s-]?strength|assisted[\s-]?(pull|chin)|ski[\s-]?erg|rowing[\s-]?machine)\b/i,
  bands:      /\b(resistance[\s-]?band|mini[\s-]?band|loop[\s-]?band|theraband|tube[\s-]?band|band)\b/i,
  pullup_bar: /\b(pull[\s-]?ups?|pullups?|chin[\s-]?ups?|chinups?|muscle[\s-]?ups?)\b/i,
};

// Gear that disqualifies a move from "bodyweight" but has no selectable token of
// its own (so it can never be requested, only excluded).
const OTHER_GEAR_NAME_PATTERN =
  /\b(suspension|trx|gymnastic[\s-]?rings?|\brings?\b|medicine[\s-]?ball|slam[\s-]?ball|wall[\s-]?ball|sandbag|battle[\s-]?ropes?|sled|prowler|bosu|ab[\s-]?wheel|ab[\s-]?roller|weight[\s-]?plate|plate[\s-]?loaded|ez[\s-]?curl[\s-]?bar)\b/i;

// Names that contain a gear word but are genuinely bodyweight — guard against
// false positives so we don't shrink the bodyweight pool incorrectly.
// (e.g. "Banded"-free machine-name stretches are rare; this list stays tiny and
// explicit rather than clever.)
const BODYWEIGHT_NAME_EXCEPTIONS = [
  // none currently — kept as an explicit hook for future tuning
];

function isBodyweightException(name) {
  const n = (name || '').toLowerCase();
  return BODYWEIGHT_NAME_EXCEPTIONS.some(ex => n.includes(ex));
}

// Tokens implied by the exercise NAME (only the selectable ones).
function nameGearTokens(name) {
  const tokens = new Set();
  if (!name) return tokens;
  for (const [token, re] of Object.entries(GEAR_NAME_PATTERNS)) {
    if (re.test(name)) tokens.add(token);
  }
  return tokens;
}

// Does the NAME imply this move needs ANY equipment (selectable or not)?
function nameNeedsEquipment(name) {
  if (!name) return false;
  if (isBodyweightException(name)) return false;
  if (OTHER_GEAR_NAME_PATTERN.test(name)) return true;
  return nameGearTokens(name).size > 0;
}

function columnIsBodyweight(equipment) {
  const e = (equipment || '').toLowerCase().trim();
  return !e || e === 'none' || e === 'bodyweight' || e === 'body weight';
}

// Does `ex` satisfy AT LEAST ONE of the coach's selected equipment tokens?
// `selectedEquipment` is the array from the generator request (e.g.
// ['bodyweight'] or ['barbell','dumbbell','cable','machine','bodyweight']).
// Empty / missing selection means "no constraint" (matches everything).
function exerciseMatchesEquipment(ex, selectedEquipment) {
  if (!selectedEquipment || selectedEquipment.length === 0) return true;
  const name = ex && ex.name ? String(ex.name) : '';
  const col = (ex && ex.equipment ? String(ex.equipment) : '').toLowerCase();
  const tokens = nameGearTokens(name);
  const needsEq = nameNeedsEquipment(name);

  return selectedEquipment.some(eq => {
    const x = String(eq || '').toLowerCase();
    if (x === 'bodyweight') {
      // Bodyweight ONLY if the column reads bodyweight/blank AND the name does
      // not name any gear. This is what stops mislabeled gear from leaking.
      return columnIsBodyweight(col) && !needsEq;
    }
    if (x === 'bands') {
      return col.includes('band') || tokens.has('bands');
    }
    if (x === 'pullup_bar') {
      return col.includes('pull-up') || col.includes('pullup') || col.includes('pull up') || tokens.has('pullup_bar');
    }
    // barbell / dumbbell / cable / machine / kettlebell:
    // match on the column OR the name (recovers gear mistagged as bodyweight).
    return col.includes(x) || tokens.has(x);
  });
}

module.exports = {
  nameGearTokens,
  nameNeedsEquipment,
  exerciseMatchesEquipment,
  GEAR_NAME_PATTERNS,
};
