const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Movement Pattern Detection ───────────────────────────────────────────────
// Comprehensive pattern detection that covers edge cases like "Close Grip Press",
// "Hammer Strength Row", etc. Order matters - specific patterns before generic ones.

const MOVEMENT_PATTERNS = [
  // === SHOULDERS (check specific shoulder patterns before generic) ===
  { pattern: 'UPRIGHT_ROW', muscle: 'SHOULDERS', test: (n) => n.includes('upright row') },
  { pattern: 'FACE_PULL', muscle: 'SHOULDERS', test: (n) => n.includes('face pull') },
  { pattern: 'LATERAL_RAISE', muscle: 'SHOULDERS', test: (n) => n.includes('lateral raise') || n.includes('side raise') || n.includes('side lateral') || n.includes('lateral delt') },
  { pattern: 'FRONT_RAISE', muscle: 'SHOULDERS', test: (n) => n.includes('front raise') || n.includes('front delt raise') },
  { pattern: 'REVERSE_FLY', muscle: 'SHOULDERS', test: (n) => (n.includes('reverse') || n.includes('rear')) && (n.includes('fly') || n.includes('flye') || n.includes('delt')) },
  { pattern: 'SHOULDER_PRESS', muscle: 'SHOULDERS', test: (n) =>
    n.includes('shoulder press') || n.includes('overhead press') || n.includes('military press') ||
    n.includes('ohp') || n.includes('arnold press') || n.includes('push press') ||
    n.includes('seated press') || n.includes('standing press') ||
    (n.includes('dumbbell press') && (n.includes('shoulder') || n.includes('seated') || n.includes('standing')))
  },

  // === TRAPS ===
  { pattern: 'SHRUG', muscle: 'TRAPS', test: (n) => n.includes('shrug') },

  // === BACK (check specific before generic) ===
  { pattern: 'VERTICAL_PULL', muscle: 'BACK', test: (n) =>
    n.includes('pulldown') || n.includes('pull-down') || n.includes('pull down') ||
    n.includes('pullup') || n.includes('pull-up') || n.includes('pull up') ||
    n.includes('chin-up') || n.includes('chinup') || n.includes('chin up')
  },
  { pattern: 'PULLOVER', muscle: 'BACK', test: (n) => n.includes('pullover') || n.includes('pull-over') || n.includes('pull over') },
  { pattern: 'ROW', muscle: 'BACK', test: (n) =>
    n.includes('row') && !n.includes('upright') // upright row already caught above
  },

  // === CHEST (check specific press types before generic) ===
  { pattern: 'CHEST_PRESS', muscle: 'CHEST', isTricepRelated: true, test: (n) =>
    n.includes('bench press') || n.includes('chest press') || n.includes('incline press') ||
    n.includes('decline press') || n.includes('floor press') || n.includes('close grip press') ||
    n.includes('close-grip press') || n.includes('close grip bench') || n.includes('close-grip bench') ||
    n.includes('board press') || n.includes('pin press') || n.includes('spoto press') ||
    n.includes('larsen press') || n.includes('jm press') ||
    // "Dumbbell Press" without shoulder context = chest press
    (n.includes('dumbbell press') && !n.includes('shoulder') && !n.includes('seated') && !n.includes('standing'))
  },
  { pattern: 'FLY', muscle: 'CHEST', test: (n) =>
    (n.includes('fly') || n.includes('flye') || n.includes('flys') || n.includes('flies')) &&
    !n.includes('reverse') && !n.includes('rear') // reverse fly caught above
  },

  // === LEGS (check specific before generic) ===
  { pattern: 'LEG_PRESS', muscle: 'LEGS', test: (n) => n.includes('leg press') },
  { pattern: 'HACK_SQUAT', muscle: 'LEGS', test: (n) => n.includes('hack squat') || n.includes('hack machine') || n.includes('v-squat') || n.includes('v squat') },
  { pattern: 'SQUAT', muscle: 'LEGS', test: (n) =>
    n.includes('squat') && !n.includes('split squat') && !n.includes('hack squat') && !n.includes('v squat') && !n.includes('v-squat')
  },
  { pattern: 'LUNGE', muscle: 'LEGS', test: (n) =>
    n.includes('lunge') || n.includes('step up') || n.includes('step-up') ||
    n.includes('split squat') || n.includes('bulgarian')
  },
  { pattern: 'LEG_CURL', muscle: 'LEGS', test: (n) =>
    n.includes('leg curl') || n.includes('hamstring curl') || n.includes('nordic curl') ||
    n.includes('nordic') || n.includes('glute ham raise') || n.includes('ghr') ||
    ((n.includes('lying curl') || n.includes('seated curl') || n.includes('standing curl')) &&
     (n.includes('leg') || n.includes('hamstring')))
  },
  { pattern: 'LEG_EXTENSION', muscle: 'LEGS', test: (n) =>
    (n.includes('leg extension') || n.includes('quad extension') || n.includes('knee extension'))
  },
  { pattern: 'HIP_ADDUCTION', muscle: 'LEGS', test: (n) =>
    n.includes('adduct') || n.includes('inner thigh') || n.includes('copenhagen')
  },
  { pattern: 'HIP_ABDUCTION', muscle: 'LEGS', test: (n) =>
    n.includes('abduct') || n.includes('outer thigh') || n.includes('clamshell') || n.includes('clam shell')
  },

  // === DEADLIFT / HIP HINGE ===
  { pattern: 'DEADLIFT', muscle: 'POSTERIOR_CHAIN', test: (n) =>
    n.includes('deadlift') || n.includes('rdl') || n.includes('romanian') ||
    n.includes('good morning') || n.includes('rack pull') || n.includes('block pull') ||
    n.includes('kettlebell swing') || n.includes('kb swing') ||
    n.includes('pull through') || n.includes('pull-through') ||
    n.includes('hip hinge') || n.includes('stiff leg') || n.includes('stiff-leg')
  },

  // === GLUTES ===
  { pattern: 'GLUTE', muscle: 'GLUTES', test: (n) =>
    n.includes('glute') || n.includes('hip thrust') || n.includes('glute bridge') ||
    n.includes('donkey kick') || n.includes('fire hydrant') || n.includes('frog pump')
  },

  // === CALVES ===
  { pattern: 'CALF_RAISE', muscle: 'CALVES', test: (n) =>
    n.includes('calf raise') || n.includes('calf press') || n.includes('calf') || n.includes('calves')
  },

  // === ARMS - Forearms (before bicep/tricep) ===
  { pattern: 'WRIST_CURL', muscle: 'FOREARMS', test: (n) =>
    n.includes('wrist curl') || n.includes('wrist extension') || n.includes('forearm curl') ||
    n.includes('reverse curl') || n.includes('forearm')
  },

  // === ARMS - Biceps ===
  { pattern: 'CURL', muscle: 'BICEPS', isBicep: true, test: (n) =>
    n.includes('curl') || n.includes('bicep') || n.includes('biceps') ||
    n.includes('preacher') || n.includes('concentration') ||
    (n.includes('hammer') && !n.includes('hammer strength'))
  },

  // === ARMS - Triceps ===
  { pattern: 'TRICEP_EXTENSION', muscle: 'TRICEPS', isTricep: true, test: (n) =>
    n.includes('tricep') || n.includes('triceps') || n.includes('pushdown') || n.includes('push-down') ||
    n.includes('skull') || n.includes('skullcrusher') || n.includes('skull crusher') ||
    n.includes('close grip') || // close grip = tricep emphasis
    (n.includes('kickback') && !n.includes('glute')) ||
    (n.includes('extension') && !n.includes('back') && !n.includes('leg') && !n.includes('hip') && !n.includes('knee') && !n.includes('quad'))
  },

  // === CHEST - Dips (can be chest or tricep) ===
  { pattern: 'DIP', muscle: 'CHEST', test: (n) => n.includes('dip') },

  // === CORE ===
  { pattern: 'CORE_FLEXION', muscle: 'CORE', test: (n) =>
    n.includes('crunch') || n.includes('sit-up') || n.includes('sit up') || n.includes('situp') ||
    n.includes('ab roll') || n.includes('ab wheel')
  },
  { pattern: 'CORE_ROTATION', muscle: 'CORE', test: (n) =>
    n.includes('russian twist') || n.includes('woodchop') || n.includes('wood chop') ||
    n.includes('pallof') || n.includes('rotation')
  },
  { pattern: 'CORE_STABILITY', muscle: 'CORE', test: (n) =>
    n.includes('plank') || n.includes('dead bug') || n.includes('bird dog') ||
    n.includes('hollow') || n.includes('anti-rotation')
  },
  { pattern: 'LEG_RAISE', muscle: 'CORE', test: (n) =>
    n.includes('leg raise') || n.includes('hanging raise') || n.includes('knee raise') ||
    n.includes('toes to bar') || n.includes('toes-to-bar')
  },

  // === CARDIO / HIIT ===
  { pattern: 'STAIR_CLIMB', muscle: 'CARDIO', test: (n) =>
    n.includes('stairmaster') || n.includes('stair master') || n.includes('stair climb') ||
    n.includes('stair stepper') || n.includes('step mill') || n.includes('stepmill') ||
    n.includes('stair mill') || n.includes('stairs')
  },
  { pattern: 'CYCLE', muscle: 'CARDIO', test: (n) =>
    n.includes('bike') || n.includes('cycle') || n.includes('cycling') ||
    n.includes('spin') || n.includes('assault bike') || n.includes('air bike') ||
    n.includes('airdyne') || n.includes('echo bike') || n.includes('fan bike') ||
    n.includes('peloton') || n.includes('stationary bike')
  },
  { pattern: 'ROW_CARDIO', muscle: 'CARDIO', test: (n) =>
    (n.includes('row') && (n.includes('machine') || n.includes('erg') || n.includes('cardio') || n.includes('concept') || n.includes('c2'))) ||
    n.includes('rowing machine') || n.includes('rower') || n.includes('ergometer')
  },
  { pattern: 'RUN', muscle: 'CARDIO', test: (n) =>
    n.includes('run') || n.includes('sprint') || n.includes('jog') ||
    n.includes('treadmill') || n.includes('track')
  },
  { pattern: 'JUMP', muscle: 'CARDIO', test: (n) =>
    n.includes('jump') || n.includes('box jump') || n.includes('jump rope') ||
    n.includes('skipping') || n.includes('skip rope') || n.includes('double under') ||
    n.includes('jumping jack') || n.includes('star jump') || n.includes('tuck jump') ||
    n.includes('broad jump') || n.includes('squat jump') || n.includes('lunge jump')
  },
  { pattern: 'HIIT_MOVEMENT', muscle: 'CARDIO', test: (n) =>
    n.includes('burpee') || n.includes('mountain climber') || n.includes('high knee') ||
    n.includes('butt kick') || n.includes('battle rope') || n.includes('sled') ||
    n.includes('prowler') || n.includes('farmer') || n.includes('carry') ||
    n.includes('bear crawl') || n.includes('shuttle') || n.includes('agility') ||
    n.includes('tabata') || n.includes('amrap') || n.includes('emom') ||
    n.includes('conditioning') || n.includes('met con') || n.includes('metcon')
  },
  { pattern: 'ELLIPTICAL', muscle: 'CARDIO', test: (n) =>
    n.includes('elliptical') || n.includes('cross trainer') || n.includes('crosstrainer')
  },
  { pattern: 'SWIM', muscle: 'CARDIO', test: (n) =>
    n.includes('swim') || n.includes('pool') || n.includes('lap')
  },
];

// Cardio machine patterns where same-type variants (e.g. different speeds) are NOT valid swaps.
// If someone wants to swap an Elliptical, they don't want another Elliptical variant —
// they want a genuinely different machine like a Treadmill or Stationary Bike.
const CARDIO_MACHINE_PATTERNS = new Set([
  'STAIR_CLIMB', 'CYCLE', 'ROW_CARDIO', 'RUN', 'ELLIPTICAL', 'SWIM',
]);

// ─── Sub-Pattern Detection (angle, grip, stance) ─────────────────────────────
// Used for finer-grained scoring: incline bench → incline bench > flat bench > decline bench

function detectSubPatterns(name) {
  const n = name.toLowerCase();
  const sub = {};

  // Angle
  if (n.includes('incline')) sub.angle = 'incline';
  else if (n.includes('decline')) sub.angle = 'decline';
  else if (n.includes('flat') || n.includes('bench press') || n.includes('floor press')) sub.angle = 'flat';

  // Grip width
  if (n.includes('close grip') || n.includes('close-grip') || n.includes('narrow')) sub.grip = 'narrow';
  else if (n.includes('wide grip') || n.includes('wide-grip') || n.includes('wide')) sub.grip = 'wide';
  else if (n.includes('neutral grip') || n.includes('neutral-grip') || n.includes('parallel')) sub.grip = 'neutral';
  else if (n.includes('supinated') || n.includes('underhand')) sub.grip = 'supinated';
  else if (n.includes('pronated') || n.includes('overhand')) sub.grip = 'pronated';

  // Position
  if (n.includes('seated') || n.includes('sitting')) sub.position = 'seated';
  else if (n.includes('standing')) sub.position = 'standing';
  else if (n.includes('lying') || n.includes('prone') || n.includes('supine')) sub.position = 'lying';
  else if (n.includes('incline')) sub.position = 'incline';

  // Laterality
  if (n.includes('single arm') || n.includes('single-arm') || n.includes('one arm') || n.includes('one-arm') ||
      n.includes('single leg') || n.includes('single-leg') || n.includes('one leg') || n.includes('one-leg') ||
      n.includes('unilateral')) {
    sub.unilateral = true;
  }

  // Implement type (barbell sub-types)
  if (n.includes('ez bar') || n.includes('ez-bar') || n.includes('ez curl')) sub.implement = 'ez_bar';
  else if (n.includes('trap bar') || n.includes('hex bar')) sub.implement = 'trap_bar';
  else if (n.includes('swiss bar') || n.includes('football bar')) sub.implement = 'swiss_bar';
  else if (n.includes('smith')) sub.implement = 'smith';

  return sub;
}

// Detect movement pattern for an exercise name
function detectMovement(exerciseName) {
  const name = (exerciseName || '').toLowerCase();

  for (const mp of MOVEMENT_PATTERNS) {
    if (mp.test(name)) {
      return {
        pattern: mp.pattern,
        muscle: mp.muscle,
        isBicep: !!mp.isBicep,
        isTricep: !!mp.isTricep,
        isTricepRelated: !!mp.isTricepRelated,
        subPatterns: detectSubPatterns(name),
      };
    }
  }

  // Fallback - try to detect muscle from generic keywords
  let muscle = '';
  if (name.includes('chest') || name.includes('pec')) muscle = 'CHEST';
  else if (name.includes('back') || name.includes('lat ') || name.includes('lats')) muscle = 'BACK';
  else if (name.includes('shoulder') || name.includes('delt')) muscle = 'SHOULDERS';
  else if (name.includes('bicep')) muscle = 'BICEPS';
  else if (name.includes('tricep')) muscle = 'TRICEPS';
  else if (name.includes('leg') || name.includes('quad') || name.includes('hamstring')) muscle = 'LEGS';
  else if (name.includes('core') || name.includes('ab ') || name.includes('abs')) muscle = 'CORE';
  else if (name.includes('glute')) muscle = 'GLUTES';
  else if (name.includes('cardio') || name.includes('hiit') || name.includes('conditioning') || name.includes('interval')) muscle = 'CARDIO';

  return {
    pattern: null,
    muscle,
    isBicep: name.includes('bicep') || name.includes('curl'),
    isTricep: name.includes('tricep'),
    isTricepRelated: false,
    subPatterns: detectSubPatterns(name),
  };
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────
// Multi-dimensional scoring for exercise similarity

function scoreAlternative(original, alt, origMovement, altMovement) {
  let score = 0;
  const reasons = [];

  // 1. MOVEMENT PATTERN MATCH (+100) - Highest priority
  if (origMovement.pattern && altMovement.pattern && origMovement.pattern === altMovement.pattern) {
    score += 100;
    reasons.push('same_movement');
  }
  // Related movement patterns (+60, or +90 for cardio machine swaps)
  else if (origMovement.pattern && altMovement.pattern) {
    const related = getRelatedPatterns(origMovement.pattern);
    if (related.includes(altMovement.pattern)) {
      // Cardio machines get a higher related-pattern score since same-pattern
      // variants are excluded — related machines ARE the best swaps
      const isCardioSwap = CARDIO_MACHINE_PATTERNS.has(origMovement.pattern) &&
                           CARDIO_MACHINE_PATTERNS.has(altMovement.pattern);
      score += isCardioSwap ? 90 : 60;
      reasons.push('related_movement');
    }
  }

  // 2. SUB-PATTERN MATCHES (+15 each, up to +45)
  const origSub = origMovement.subPatterns;
  const altSub = altMovement.subPatterns;
  if (origSub.angle && altSub.angle && origSub.angle === altSub.angle) {
    score += 15;
    reasons.push('same_angle');
  }
  if (origSub.grip && altSub.grip && origSub.grip === altSub.grip) {
    score += 15;
    reasons.push('same_grip');
  }
  if (origSub.position && altSub.position && origSub.position === altSub.position) {
    score += 10;
    reasons.push('same_position');
  }

  // 3. SECONDARY MUSCLE OVERLAP (+25)
  const origSecondary = parseSecondaryMuscles(original.secondary_muscles);
  const altSecondary = parseSecondaryMuscles(alt.secondary_muscles);
  if (origSecondary.length > 0 && altSecondary.length > 0) {
    const overlap = origSecondary.filter(m => altSecondary.includes(m));
    if (overlap.length > 0) {
      score += Math.min(overlap.length * 12, 25);
      reasons.push('secondary_overlap');
    }
  }

  // 4. COMPOUND/ISOLATION MATCH (+20)
  const origCompound = original.is_compound;
  const altCompound = alt.is_compound;
  if (origCompound !== undefined && altCompound !== undefined && origCompound === altCompound) {
    score += 20;
    reasons.push('same_type');
  }

  // 5. EQUIPMENT MATCH (+15)
  if (original.equipment && alt.equipment) {
    if (alt.equipment.toLowerCase() === original.equipment.toLowerCase()) {
      score += 15;
      reasons.push('same_equipment');
    }
  }

  // 6. DIFFICULTY MATCH (+5)
  if (original.difficulty && alt.difficulty === original.difficulty) {
    score += 5;
    reasons.push('same_difficulty');
  }

  return { score, reasons };
}

function parseSecondaryMuscles(secondary) {
  if (!secondary) return [];
  if (Array.isArray(secondary)) return secondary.map(m => (m || '').toLowerCase().trim()).filter(Boolean);
  if (typeof secondary === 'string') {
    try {
      const parsed = JSON.parse(secondary);
      if (Array.isArray(parsed)) return parsed.map(m => (m || '').toLowerCase().trim()).filter(Boolean);
    } catch { /* ignore */ }
    return secondary.split(',').map(m => m.toLowerCase().trim()).filter(Boolean);
  }
  return [];
}

// Related movement patterns - for "nearby" movement suggestions
function getRelatedPatterns(pattern) {
  const relations = {
    'ROW': ['VERTICAL_PULL', 'FACE_PULL', 'PULLOVER'],
    'VERTICAL_PULL': ['ROW', 'PULLOVER'],
    'PULLOVER': ['VERTICAL_PULL', 'ROW'],
    'CHEST_PRESS': ['DIP', 'FLY'],
    'FLY': ['CHEST_PRESS'],
    'DIP': ['CHEST_PRESS', 'TRICEP_EXTENSION'],
    'SHOULDER_PRESS': ['LATERAL_RAISE', 'FRONT_RAISE', 'UPRIGHT_ROW'],
    'LATERAL_RAISE': ['SHOULDER_PRESS', 'FRONT_RAISE', 'UPRIGHT_ROW'],
    'FRONT_RAISE': ['SHOULDER_PRESS', 'LATERAL_RAISE'],
    'UPRIGHT_ROW': ['SHOULDER_PRESS', 'LATERAL_RAISE', 'SHRUG'],
    'REVERSE_FLY': ['FACE_PULL', 'ROW'],
    'FACE_PULL': ['REVERSE_FLY', 'ROW'],
    'SQUAT': ['LEG_PRESS', 'HACK_SQUAT', 'LUNGE'],
    'LEG_PRESS': ['SQUAT', 'HACK_SQUAT'],
    'HACK_SQUAT': ['SQUAT', 'LEG_PRESS'],
    'LUNGE': ['SQUAT', 'LEG_PRESS'],
    'LEG_CURL': ['DEADLIFT', 'GLUTE'],
    'LEG_EXTENSION': ['SQUAT', 'LEG_PRESS'],
    'DEADLIFT': ['LEG_CURL', 'GLUTE', 'ROW'],
    'GLUTE': ['DEADLIFT', 'LEG_CURL', 'LUNGE'],
    'CURL': ['CURL'], // biceps only swap with biceps
    'TRICEP_EXTENSION': ['DIP', 'CHEST_PRESS'],
    'CALF_RAISE': ['CALF_RAISE'],
    'SHRUG': ['UPRIGHT_ROW'],
    'WRIST_CURL': ['WRIST_CURL'],
    'CORE_FLEXION': ['CORE_STABILITY', 'LEG_RAISE'],
    'CORE_ROTATION': ['CORE_STABILITY'],
    'CORE_STABILITY': ['CORE_FLEXION', 'CORE_ROTATION'],
    'LEG_RAISE': ['CORE_FLEXION', 'CORE_STABILITY'],
    'HIP_ADDUCTION': ['HIP_ABDUCTION', 'LUNGE'],
    'HIP_ABDUCTION': ['HIP_ADDUCTION', 'GLUTE'],
    // Cardio / HIIT
    'STAIR_CLIMB': ['CYCLE', 'ELLIPTICAL', 'JUMP', 'HIIT_MOVEMENT', 'RUN'],
    'CYCLE': ['STAIR_CLIMB', 'ELLIPTICAL', 'RUN', 'ROW_CARDIO'],
    'ROW_CARDIO': ['CYCLE', 'ELLIPTICAL', 'SWIM', 'HIIT_MOVEMENT'],
    'RUN': ['CYCLE', 'STAIR_CLIMB', 'JUMP', 'ELLIPTICAL', 'HIIT_MOVEMENT'],
    'JUMP': ['STAIR_CLIMB', 'RUN', 'HIIT_MOVEMENT', 'CYCLE'],
    'HIIT_MOVEMENT': ['JUMP', 'STAIR_CLIMB', 'RUN', 'CYCLE', 'ROW_CARDIO'],
    'ELLIPTICAL': ['STAIR_CLIMB', 'CYCLE', 'RUN', 'ROW_CARDIO'],
    'SWIM': ['ROW_CARDIO', 'CYCLE', 'ELLIPTICAL'],
  };
  return relations[pattern] || [];
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────

function shouldExcludeAlternative(original, alt, origMovement) {
  const altName = (alt.name || '').toLowerCase();
  const origName = (original.name || '').toLowerCase();

  // Exclude current exercise
  if (String(alt.id) === String(original.id)) return true;

  // Exclude same cardio machine type — different speeds/variants of the same
  // machine are not useful swaps (e.g. Elliptical Fast ↔ Elliptical Normal).
  // Instead, the user wants a genuinely different cardio machine.
  if (origMovement.pattern && CARDIO_MACHINE_PATTERNS.has(origMovement.pattern)) {
    const altMovement = detectMovement(altName);
    if (altMovement.pattern === origMovement.pattern) return true;
  }

  // Filter out stretches/warmups for strength exercises
  const isStretchOrWarmup = altName.includes('stretch') || altName.includes('warmup') || altName.includes('warm up') || altName.includes('mobility') || altName.includes('foam roll');
  const originalIsStrength = !origName.includes('stretch') && !origName.includes('warmup') && !origName.includes('mobility');
  if (originalIsStrength && isStretchOrWarmup) return true;

  // BICEP exercise: exclude tricep, chest exercises
  if (origMovement.isBicep) {
    const altMovement = detectMovement(altName);
    if (altMovement.isTricep || altMovement.isTricepRelated) return true;
    // Only allow exercises that are clearly bicep-related
    const isBicepAlt = altName.includes('bicep') || altName.includes('biceps') || altName.includes('curl') ||
                       (altName.includes('hammer') && !altName.includes('hammer strength')) ||
                       altName.includes('preacher') || altName.includes('concentration');
    if (!isBicepAlt) return true;
  }

  // TRICEP exercise: exclude bicep, non-tricep exercises
  if (origMovement.isTricep) {
    const altMovement = detectMovement(altName);
    if (altMovement.isBicep) return true;
    // Only allow exercises that are clearly tricep-related (including close grip press, dips)
    const isTricepAlt = altName.includes('tricep') || altName.includes('triceps') ||
                        altName.includes('pushdown') || altName.includes('push-down') ||
                        altName.includes('skull') || altName.includes('skullcrusher') ||
                        altName.includes('close grip') || altName.includes('close-grip') ||
                        altName.includes('dip') || altName.includes('jm press') ||
                        (altName.includes('kickback') && !altName.includes('glute')) ||
                        (altName.includes('extension') && !altName.includes('back') && !altName.includes('leg') && !altName.includes('hip') && !altName.includes('knee'));
    if (!isTricepAlt) return true;
  }

  // TRICEP-RELATED press (close grip press): also exclude bicep exercises
  if (origMovement.isTricepRelated) {
    const altMovement = detectMovement(altName);
    if (altMovement.isBicep) return true;
  }

  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { exercise, workoutExercises = [], equipment = "", coachId = null, previousSuggestionIds = [] } = JSON.parse(event.body);

    if (!exercise) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Exercise is required" }) };
    }

    const muscleGroup = exercise.muscle_group || exercise.muscleGroup || "";
    const exerciseName = exercise.name || "";

    // Detect movement pattern for the original exercise
    const origMovement = detectMovement(exerciseName);

    // Map movement-detected muscle to expected DB muscle_group.
    // This corrects misclassifications (e.g. "Biceps Femoris" wrongly stored as "arms"
    // when it should be "legs") so the query fetches the right candidate pool.
    const MOVEMENT_MUSCLE_TO_GROUP = {
      'POSTERIOR_CHAIN': 'legs',
      'LEGS': 'legs',
      'GLUTES': 'legs',
      'CALVES': 'legs',
      'CHEST': 'chest',
      'BACK': 'back',
      'SHOULDERS': 'shoulders',
      'TRAPS': 'back',
      'BICEPS': 'arms',
      'TRICEPS': 'arms',
      'FOREARMS': 'arms',
      'CORE': 'core',
      'CARDIO': 'cardio',
    };
    const detectedMuscleGroup = origMovement.muscle ? MOVEMENT_MUSCLE_TO_GROUP[origMovement.muscle] : null;

    // Use the movement-detected muscle group when it differs from the stored one
    // (e.g. sumo deadlift stored as "arms" but detected as "legs")
    const effectiveMuscleGroup = detectedMuscleGroup || muscleGroup;

    console.log("AI Swap - Exercise:", exerciseName, "| Stored muscle:", muscleGroup,
      "| Detected muscle:", detectedMuscleGroup,
      "| Effective:", effectiveMuscleGroup,
      "| Pattern:", origMovement.pattern, "| Specific:", origMovement.muscle,
      "| Sub:", JSON.stringify(origMovement.subPatterns),
      "| Equipment filter:", equipment,
      "| Refresh:", previousSuggestionIds.length > 0 ? `yes (excluding ${previousSuggestionIds.length} previous)` : "no");

    // Fetch potential alternatives from database - increased limit for better candidates
    let query = supabase
      .from("exercises")
      .select("id, name, muscle_group, secondary_muscles, equipment, difficulty, exercise_type, description, thumbnail_url, animation_url, video_url, is_compound, is_unilateral")
      .limit(200);

    // Filter by muscle group - use detected movement muscle group when available
    // to correct misclassified exercises (e.g. deadlifts stored as "arms" due to
    // "Biceps Femoris" in scientific muscle names)
    if (detectedMuscleGroup && detectedMuscleGroup !== muscleGroup) {
      // Stored and detected differ — query BOTH to catch correctly and incorrectly categorized exercises
      query = query.or(`muscle_group.ilike.%${detectedMuscleGroup}%,muscle_group.ilike.%${muscleGroup}%`);
    } else if (effectiveMuscleGroup) {
      query = query.ilike("muscle_group", `%${effectiveMuscleGroup}%`);
    }

    // Scope to global exercises + this coach's custom exercises
    // Without this, the service key bypasses RLS and returns ALL coaches' custom exercises
    if (coachId) {
      query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`);
    } else {
      query = query.is("coach_id", null);
    }

    const { data: alternatives, error: dbError } = await query;

    if (dbError) {
      console.error("Database error:", dbError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch exercises", details: dbError.message }) };
    }

    if (!alternatives || alternatives.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ suggestions: [], message: "No alternative exercises found in this muscle group" }) };
    }

    // Get exercise IDs already in the workout to exclude them
    const workoutExerciseIds = new Set(workoutExercises.map(ex => String(ex.id)).filter(Boolean));

    // Get previously suggested exercise IDs to exclude on refresh
    const previousIds = new Set((previousSuggestionIds || []).map(id => String(id)).filter(Boolean));

    // Filter, score, and sort alternatives
    const scored = [];
    for (const alt of alternatives) {
      // Skip exercises already in workout
      if (workoutExerciseIds.has(String(alt.id))) continue;

      // Skip previously suggested exercises (so refresh gives new results)
      if (previousIds.has(String(alt.id))) continue;

      // Apply exclusion rules (bicep/tricep conflicts, stretches, etc.)
      if (shouldExcludeAlternative(exercise, alt, origMovement)) continue;

      // Apply equipment filter if specified
      if (equipment) {
        const altEquip = (alt.equipment || '').toLowerCase();
        if (!altEquip.includes(equipment.toLowerCase())) continue;
      }

      // Detect alt movement pattern and score
      const altMovement = detectMovement(alt.name);
      const { score, reasons } = scoreAlternative(exercise, alt, origMovement, altMovement);

      scored.push({ ...alt, _score: score, _reasons: reasons, _altMovement: altMovement });
    }

    // Sort by score descending, then alphabetically
    scored.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Clean internal fields for the sorted list
    const sortedAlternatives = scored.map(({ _score, _reasons, _altMovement, ...rest }) => rest);

    console.log("AI Swap - After filtering:", sortedAlternatives.length,
      "| Top 5:", scored.slice(0, 5).map(a => `${a.name} (${a._score})`));

    if (sortedAlternatives.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ suggestions: [], message: "No alternative exercises available" }) };
    }

    // ─── AI-Powered Ranking with GPT-4o-mini ──────────────────────────────────
    let aiSuggestions = [];

    const topCandidates = scored.slice(0, 20).map(ex => ({
      id: ex.id,
      name: ex.name,
      muscle_group: ex.muscle_group,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      score: ex._score,
      match_reasons: ex._reasons,
    }));

    // Build a context-rich prompt
    const movementDesc = origMovement.pattern ?
      `Movement pattern: ${origMovement.pattern.replace(/_/g, ' ')}` : 'Movement pattern: unclassified';
    const subDesc = Object.entries(origMovement.subPatterns)
      .map(([k, v]) => `${k}: ${v}`).join(', ');

    const rankingPrompt = `You are an expert strength & conditioning coach choosing exercise substitutions for a client's workout.

EXERCISE BEING REPLACED: "${exerciseName}"
- Muscle group: ${muscleGroup}
- Equipment: ${exercise.equipment || "bodyweight"}
- ${movementDesc}${subDesc ? ` (${subDesc})` : ''}

YOUR TASK: From the candidates below, select the 5 BEST substitutions. A good substitution should feel like a natural swap — the client should be training the same muscles through the same movement with similar difficulty.

RANKING RULES (strict priority):
1. SAME MOVEMENT PATTERN is NON-NEGOTIABLE — A squat must swap with another squat variation. A row with another row. A curl with another curl. A press with another press. If the candidate doesn't match the movement pattern, DO NOT select it.
2. SIMILAR BIOMECHANICS — Prefer same joint angles and planes of motion. Incline press → incline dumbbell press > flat press > decline press. Barbell squat → goblet squat > leg press > lunge.
3. SIMILAR TRAINING STIMULUS — Compound ↔ compound, isolation ↔ isolation. Don't replace a squat with a leg extension.
4. EQUIPMENT is the LOWEST priority — Different equipment is fine if the movement pattern matches.

HARD RULES:
- NEVER suggest an antagonist muscle exercise (no bicep curl for a tricep exercise)
- NEVER suggest a completely different movement pattern (no pulldown for a row, no fly for a press)
- NEVER suggest an isolation exercise to replace a compound (unless no compounds available)
- For CARDIO MACHINES: suggest a DIFFERENT type of machine, not the same machine. If swapping an elliptical, suggest treadmill, bike, rowing machine, etc. — never another elliptical variant.
- Prefer candidates with HIGHER algorithmic scores — they were pre-scored for movement pattern match

CANDIDATES (pre-scored by algorithm, best matches first):
${JSON.stringify(topCandidates, null, 1)}

Return ONLY valid JSON, no markdown fences, no explanation:
{"suggestions":[{"id":123,"name":"Exercise Name","reason":"Coaching reason in 10 words max"}]}

Select exactly 5.`;

    // Use higher temperature on refresh to get more varied rankings
    const isRefresh = previousSuggestionIds.length > 0;
    const aiTemperature = isRefresh ? 0.7 : 0.2;

    // Primary: GPT-4o-mini — best balance of quality and speed for exercise ranking
    try {
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not configured - falling back to Claude");
      }

      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: rankingPrompt }],
        max_tokens: 512,
        temperature: aiTemperature,
      });

      const responseText = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiSuggestions = parsed.suggestions || [];
        console.log("AI Swap - GPT-4o-mini returned", aiSuggestions.length, "suggestions");
      }
    } catch (openaiError) {
      console.error("GPT-4o-mini failed, trying Claude fallback:", openaiError.message);

      // Fallback to Claude if OpenAI fails
      try {
        if (!ANTHROPIC_API_KEY) throw new Error("No Anthropic key either");

        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-20250414',
          max_tokens: 512,
          temperature: aiTemperature,
          messages: [{ role: 'user', content: rankingPrompt }],
        });

        const responseText = message.content?.[0]?.text || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiSuggestions = parsed.suggestions || [];
          console.log("AI Swap - Claude fallback returned", aiSuggestions.length, "suggestions");
        }
      } catch (claudeError) {
        console.error("Claude fallback also failed:", claudeError.message);
      }
    }

    // If AI completely failed, use rule-based fallback
    if (aiSuggestions.length === 0) {
      aiSuggestions = scored.slice(0, 5).map(ex => ({
        id: ex.id,
        name: ex.name,
        reason: ex._reasons.includes('same_movement') ?
          `Same ${origMovement.pattern?.replace(/_/g, ' ').toLowerCase() || 'movement'} pattern` :
          `Similar ${ex.muscle_group} exercise${ex.equipment ? ` with ${ex.equipment}` : ""}`
      }));
    }

    // Enrich suggestions with full exercise data
    const enrichedSuggestions = aiSuggestions.map(suggestion => {
      const fullExercise = sortedAlternatives.find(
        ex => String(ex.id) === String(suggestion.id) ||
              ex.name.toLowerCase() === (suggestion.name || '').toLowerCase()
      );
      if (fullExercise) {
        return { ...fullExercise, ai_reason: suggestion.reason };
      }
      return null;
    }).filter(Boolean);

    // If enrichment failed, use scored fallback
    if (enrichedSuggestions.length === 0) {
      const fallbackSuggestions = sortedAlternatives.slice(0, 5).map(ex => ({
        ...ex,
        ai_reason: `Alternative ${ex.muscle_group} exercise${ex.equipment ? ` using ${ex.equipment}` : ""}`
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ suggestions: fallbackSuggestions, message: `Found ${fallbackSuggestions.length} alternatives` }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ suggestions: enrichedSuggestions, message: `Found ${enrichedSuggestions.length} smart alternatives` }),
    };

  } catch (error) {
    console.error("AI Swap Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to generate swap suggestions", details: error.message }) };
  }
};
