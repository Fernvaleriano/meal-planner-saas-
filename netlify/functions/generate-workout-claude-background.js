// Netlify BACKGROUND function — long-running AI workout generator using Sonnet.
//
// Naming convention: any file ending in `-background.js` is automatically run
// as a Netlify background function. Background functions return 202 immediately,
// then run for up to 15 minutes. Perfect for "I don't care if it takes 3 minutes"
// coach-quality generation that doesn't fit Netlify's normal 26-second wall.
//
// Job state is written to Supabase Storage (bucket: ai-workout-jobs) keyed by
// {coachId}/{jobId}.json. The frontend polls /get-workout-job to check progress.
//
// This file contains its own copies of helpers from generate-workout-claude.js
// to keep the background function self-contained. Keep them in sync if you edit
// the canonical generator.
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors } = require('./utils/auth');
const { analyzeClientHistory, formatAnalysisForPrompt, applyMovementScreenExclusions } = require('./utils/client-analysis');
const { exerciseMatchesEquipment, filterUnavailableEquipment } = require('./utils/equipment-filter');
const { buildConditioningFinisher } = require('./utils/finisher');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BUCKET_NAME = 'ai-workout-jobs';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

// ─── Storage bucket helpers ───────────────────────────────────────────────────
async function ensureBucket(supabase) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024 // 10 MB cap on a single job blob
      });
    }
  } catch (err) {
    console.warn('ensureBucket warning (may already exist):', err.message);
  }
}

async function writeJob(supabase, coachId, jobId, payload) {
  const path = `${coachId}/${jobId}.json`;
  const body = Buffer.from(JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }), 'utf8');
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`writeJob failed: ${error.message}`);
}

// ─── Exercise DB cache ────────────────────────────────────────────────────────
const EXERCISE_CACHE_TTL_MS = 5 * 60 * 1000;
const exerciseCache = new Map();
async function loadExercises(supabase, coachId) {
  const cacheKey = coachId || 'global';
  const cached = exerciseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EXERCISE_CACHE_TTL_MS) return cached.exercises;
  let all = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles, coach_id')
      .range(offset, offset + 999);
    if (coachId) query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`);
    else query = query.is('coach_id', null);
    const { data, error } = await query;
    if (error) throw new Error('Unable to load exercises: ' + error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  exerciseCache.set(cacheKey, { exercises: all, timestamp: Date.now() });
  return all;
}

// ─── Injury exclusions ────────────────────────────────────────────────────────
const INJURY_EXCLUSIONS = {
  lower_back: ['deadlift', 'good morning', 'romanian', 'rdl', 'bent over row', 'barbell row', 'back squat', 'overhead squat', 'sumo'],
  knee: ['jump squat', 'tuck jump', 'box jump', 'broad jump', 'pistol squat', 'bulgarian split squat', 'deep squat', 'sissy squat', 'lunge jump'],
  shoulder: ['overhead press', 'military press', 'snatch', 'jerk', 'behind the neck', 'upright row', 'arnold press', 'handstand'],
  wrist: ['push up', 'pushup', 'push-up', 'handstand', 'planche', 'front squat', 'clean', 'snatch'],
  hip: ['pistol squat', 'cossack squat', 'deep squat', 'jefferson curl'],
  neck: ['shrug', 'behind the neck', 'upright row', 'wrestler bridge'],
  elbow: ['skull crusher', 'close grip bench', 'tricep extension', 'tate press'],
  ankle: ['jump rope', 'box jump', 'broad jump', 'depth jump', 'sprint', 'lunge jump', 'tuck jump'],
  pregnancy: ['crunch', 'sit up', 'situp', 'plank', 'leg raise', 'flutter kick', 'russian twist', 'jump', 'sprint', 'box jump', 'deadlift', 'twist']
};
function applyInjuryExclusions(exercises, injuryCodes) {
  if (!injuryCodes || injuryCodes.length === 0) return exercises;
  const ban = new Set();
  for (const code of injuryCodes) (INJURY_EXCLUSIONS[code] || []).forEach(s => ban.add(s));
  if (ban.size === 0) return exercises;
  return exercises.filter(ex => {
    const n = (ex.name || '').toLowerCase();
    for (const b of ban) if (n.includes(b)) return false;
    return true;
  });
}

// ─── Name matching ────────────────────────────────────────────────────────────
function normalizeName(name) {
  return (name || '').toLowerCase().replace(/\s*\(\d+\)\s*/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function findBestMatch(aiName, exercises) {
  const target = normalizeName(aiName);
  const exact = exercises.find(e => normalizeName(e.name) === target);
  if (exact) return exact;
  return exercises.find(e => {
    const n = normalizeName(e.name);
    return n.includes(target) || target.includes(n);
  }) || null;
}

// ─── Cue voice scrubber ───────────────────────────────────────────────────────
// The coach wants client-facing cues to read like he texted them: all lowercase,
// no em/en dashes, no AI tells. The prompt asks for this, but models slip — so we
// enforce it on the output as a safety net (same idea as the welcome note's
// humanizer). Only touches the visible note text; never the exercise data.
function humanizeCue(note) {
  if (!note || typeof note !== 'string') return note || '';
  let t = note
    .replace(/[—–]/g, ', ')        // em/en dash → comma (keeps regular hyphens like "mid-back")
    .replace(/\s+,/g, ',')          // drop space before comma (from " — " → " , ")
    .replace(/\s*,\s*,\s*/g, ', ')  // collapse doubled commas
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
  // tidy any ", ." the dash swap may have created
  t = t.replace(/,\s*\./g, '.').replace(/^[,\s]+/, '').trim();
  return t;
}

// ─── Random sampling for variety ──────────────────────────────────────────────
function sampleArray(arr, n, seed = Date.now()) {
  if (arr.length <= n) return arr.slice();
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

// ─── Multi-week progression ───────────────────────────────────────────────────
function generateMultiWeekProgression(week1Workouts, totalWeeks, goal, weightUnit = 'lb') {
  if (totalWeeks <= 1) return [];
  // Weight/load numbers are intentionally NOT written into notes — the app's
  // built-in weight tracker handles working weights. Notes describe
  // sets/reps/rest/effort intent only.
  const out = [];
  for (let w = 2; w <= totalWeeks; w++) {
    const isDeload = w % 4 === 0;
    const weekIndex = w - 1;
    const workouts = week1Workouts.map(workout => {
      const exercises = (workout.exercises || []).map(ex => {
        if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown' || ex.phase === 'conditioning') return { ...ex };
        const baseSets = Number(ex.sets) || 3;
        const baseReps = String(ex.reps || '8-12');
        let newSets = baseSets;
        let newReps = baseReps;
        let progressNote = '';
        if (isDeload) {
          newSets = Math.max(2, baseSets - 1);
          progressNote = `Week ${w} (DELOAD): drop 1 set, ease off the intensity, focus on recovery`;
        } else if (goal === 'strength') {
          progressNote = `Week ${w}: progressive overload — aim to beat last week`;
        } else if (goal === 'hypertrophy') {
          const range = baseReps.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (range) {
            const lowRep = parseInt(range[1]);
            const highRep = parseInt(range[2]);
            const repBump = Math.min(highRep, lowRep + (weekIndex - 1));
            newReps = `${repBump}-${highRep}`;
            if (weekIndex >= 3) newSets = baseSets + 1;
            progressNote = `Week ${w}: aim for ${newReps} reps`;
          } else {
            progressNote = `Week ${w}: aim for 1-2 more reps than last week`;
          }
        } else {
          const baseRest = Number(ex.restSeconds) || 60;
          const newRest = Math.max(20, baseRest - 10 * (weekIndex - 1));
          return { ...ex, restSeconds: newRest, notes: ex.notes ? `${ex.notes} | Week ${w}: shorten rest to ${newRest}s` : `Week ${w}: shorten rest to ${newRest}s` };
        }
        return { ...ex, sets: newSets, reps: newReps, notes: ex.notes ? `${ex.notes} | ${progressNote}` : progressNote };
      });
      return { ...workout, exercises };
    });
    out.push({ weekNumber: w, workouts, isDeload });
  }
  return out;
}

// ─── Split-day mapper ─────────────────────────────────────────────────────────
function computeSplitDays(daysPerWeek, split) {
  const splits = {
    push_pull_legs: {
      3: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day']],
      4: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day'], ['upper_body', 'Upper Body']],
      // 5-day: PPL + Upper/Lower, NOT push/pull twice — a pure P/P/L/P/P week
      // trains chest and back 2x but legs only 1x, which under-serves the
      // lower body for hypertrophy (June 2026 bulk-AI review).
      5: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day'], ['upper_body', 'Upper Body'], ['lower_body', 'Lower Body']],
      6: [['push', 'Push A'], ['pull', 'Pull A'], ['legs', 'Legs A'], ['push', 'Push B'], ['pull', 'Pull B'], ['legs', 'Legs B']]
    },
    upper_lower: {
      2: [['upper_body', 'Upper Body'], ['lower_body', 'Lower Body']],
      3: [['upper_body', 'Upper Body'], ['lower_body', 'Lower Body'], ['full_body', 'Full Body']],
      4: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B']],
      5: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B'], ['full_body', 'Full Body']],
      6: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B'], ['upper_body', 'Upper C'], ['lower_body', 'Lower C']]
    },
    full_body: {
      2: [['full_body', 'Full Body A'], ['full_body', 'Full Body B']],
      3: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C']],
      4: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D']],
      5: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D'], ['full_body', 'Full Body E']],
      6: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D'], ['full_body', 'Full Body E'], ['full_body', 'Full Body F']]
    },
    bro_split: {
      3: [['chest', 'Chest Day'], ['back', 'Back Day'], ['legs', 'Leg Day']],
      4: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['legs', 'Leg Day']],
      5: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['arms', 'Arm Day'], ['legs', 'Leg Day']],
      6: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['arms', 'Arm Day'], ['legs', 'Leg Day'], ['core', 'Core Day']]
    },
    push_pull: {
      2: [['push', 'Push Day'], ['pull', 'Pull Day']],
      3: [['push', 'Push Day'], ['pull', 'Pull Day'], ['full_body', 'Full Body']],
      4: [['push', 'Push A'], ['pull', 'Pull A'], ['push', 'Push B'], ['pull', 'Pull B']]
    }
  };
  const autoMap = { 2: 'upper_lower', 3: 'full_body', 4: 'upper_lower', 5: 'push_pull_legs', 6: 'push_pull_legs' };
  const effective = (split === 'auto') ? (autoMap[daysPerWeek] || 'upper_lower') : split;
  const table = splits[effective];
  if (!table || !table[daysPerWeek]) {
    return Array.from({ length: daysPerWeek }, (_, i) => ({ targetMuscle: 'full_body', dayName: `Day ${i + 1}`, dayNumber: i + 1 }));
  }
  return table[daysPerWeek].map(([target, name], i) => ({ targetMuscle: target, dayName: name, dayNumber: i + 1 }));
}

// ─── Single-day generator (the heavy lift, runs once per day) ─────────────────
async function generateOneDay(anthropic, params) {
  const {
    daySpec, exercisesByMuscleGroupSampled, exercisesAfterInjuries, exercisesWithVideos,
    equipment, goal, experience, sessionDuration, trainingStyle, exerciseCount,
    injuries, injuryCodes, preferences, tempo, rpeTarget, rirTarget,
    unilateralPreference, conditioningStyle, clientContextBlock,
    warmupSuitable, stretchExercises, avoidExercises = [], keepMandate = '', weightUnit = 'lb',
    model = 'claude-sonnet-4-5', focusAreas = []
  } = params;

  const targetMuscle = daySpec.targetMuscle;
  const muscleGroupMap = {
    chest: 'chest (pecs, upper chest, lower chest)',
    back: 'back (lats, rhomboids, traps, rear delts)',
    shoulders: 'shoulders (front delts, side delts, rear delts)',
    arms: 'arms (biceps, triceps, forearms)',
    legs: 'legs (quads, hamstrings, calves)',
    glutes: 'glutes and hamstrings',
    core: 'core (abs, obliques, lower back)',
    upper_body: 'upper body (chest, back, shoulders, arms — all four)',
    lower_body: 'lower body (quads, hamstrings, glutes, calves)',
    full_body: 'full body (all major muscle groups)',
    push: 'push (chest, shoulders, triceps)',
    pull: 'pull (back, biceps)'
  };
  const muscleLabel = muscleGroupMap[targetMuscle] || targetMuscle;

  // Strict push/pull constraint
  let strictSplitConstraint = '';
  if (targetMuscle === 'push') {
    strictSplitConstraint = `

=== STRICT PUSH-DAY RULE (100% — NEVER VIOLATE) ===
This is a PUSH workout. EVERY single main exercise must directly train chest, shoulders, OR triceps.
ABSOLUTELY FORBIDDEN — do not include ANY of these on a push day:
- Any back exercise: rows, pulldowns, pull-ups, chin-ups, face pulls, shrugs, deadlifts, pullovers
- Any biceps exercise: bicep curls of any kind (barbell, dumbbell, hammer, preacher, spider, concentration, cable, incline)
- Any leg exercise
If you include even ONE row, curl, or pulldown, the workout is WRONG. 100% push only.`;
  } else if (targetMuscle === 'pull') {
    strictSplitConstraint = `

=== STRICT PULL-DAY RULE (100% — NEVER VIOLATE) ===
This is a PULL workout. EVERY single main exercise must directly train back, rear delts, OR biceps.
ABSOLUTELY FORBIDDEN — do not include ANY of these on a pull day:
- Any chest exercise: bench press, incline press, decline press, dumbbell press, fly, dip, push-up
- Any triceps exercise: tricep extension, pushdown, kickback, skull crusher, close-grip press
- Any front-delt-pressing exercise: overhead press, military press, shoulder press, Arnold press, push press
- Any leg exercise
If you include even ONE press, fly, or tricep movement, the workout is WRONG. 100% pull only.`;
  }

  const exercisesList = Object.entries(exercisesByMuscleGroupSampled)
    .map(([g, list]) => `${g.toUpperCase()}: ${list.join(', ')}`)
    .join('\n');
  const availableExercisesPrompt = `
CRITICAL - AVAILABLE EXERCISES DATABASE:
You MUST ONLY use exercises from this list (each has a demonstration video).
Custom exercises (marked "(custom)") are this coach's own additions — preferred when they fit.

${exercisesList}
`;

  let warmupStretchInstructions = '';
  if (warmupSuitable.length > 0) {
    warmupStretchInstructions += `\nAVAILABLE WARM-UPS (copy name EXACTLY):\n${warmupSuitable.map(n => `"${n}"`).join(', ')}\nInclude 2-3 warm-ups at start. Mark "isWarmup": true.`;
  }
  if (stretchExercises.length > 0) {
    warmupStretchInstructions += `\n\nAVAILABLE STRETCHES (copy name EXACTLY):\n${stretchExercises.map(n => `"${n}"`).join(', ')}\nInclude 2-3 stretches at end matching trained muscles. Mark "isStretch": true. Reps "30s hold".`;
  }

  // Day-aware cardio warm-up. Left to itself the model opens nearly every day
  // with "Jogging"/"Treadmill Jogging". Match the machine to the day instead
  // (coach preference, June 2026): rower primes the back and grip on pull days,
  // step mill primes the lower body on leg days, elliptical is the low-impact
  // default everywhere else. Fall back down the list if a machine isn't in
  // this pool (equipment/library limits), and stay silent if none fit.
  const cardioPick = (patterns) => {
    for (const re of patterns) {
      const m = exercisesWithVideos.find(e => re.test(e.name || '') && exerciseMatchesEquipment(e, equipment));
      if (m) return m.name;
    }
    return null;
  };
  const preferredCardio = ['legs', 'lower_body', 'glutes'].includes(targetMuscle)
    ? cardioPick([/stepmill machine steps$/i, /stepmill|stair/i, /elliptical machine normal speed$/i, /elliptical/i])
    : ['pull', 'back'].includes(targetMuscle)
      ? cardioPick([/rowing machine normal speed$/i, /rowing machine/i, /elliptical machine normal speed$/i, /elliptical/i])
      : cardioPick([/elliptical machine normal speed$/i, /elliptical/i]);
  if (preferredCardio) {
    warmupStretchInstructions += `\n\nCARDIO WARM-UP CHOICE (MANDATORY): use "${preferredCardio}" (copy the name EXACTLY) as this day's cardio warm-up, easy pace, reps in TIME format ("3 min"). Do NOT use jogging or the treadmill as the warm-up.`;
  }

  const tempoMap = {
    standard: 'Use a controlled tempo (1-2 sec eccentric, 1 sec concentric).',
    controlled: 'CONTROLLED TEMPO — 3 sec eccentric, 1 sec pause, 1 sec concentric on main lifts.',
    explosive: 'EXPLOSIVE TEMPO on concentric — Lower 2 sec, drive up explosively.',
    tempo_3010: 'TEMPO 3-0-1-0 — note "3 sec down, no pause, 1 sec up" on main lifts.',
    tempo_4020: 'TEMPO 4-0-2-0 — note "4 sec down, 2 sec up" on main lifts.'
  };
  const tempoInstruction = tempoMap[tempo] || tempoMap.standard;
  let intensityInstruction = '';
  if (rpeTarget) intensityInstruction = `Target RPE ${rpeTarget}/10 on working sets.`;
  else if (rirTarget != null) intensityInstruction = `Target ${rirTarget} RIR on working sets.`;
  let unilateralInstruction = '';
  if (unilateralPreference === 'prefer_unilateral') unilateralInstruction = 'STRONGLY prefer unilateral exercises. Aim for 30-50% unilateral.';
  else if (unilateralPreference === 'bilateral_only') unilateralInstruction = 'Use ONLY bilateral exercises.';

  const repRangeBlock = goal === 'strength'
    ? '- Main compounds: 4-5 sets of 3-6 reps, 2-3 min rest\n- Accessories: 3-4 sets of 6-8 reps, 90-120s rest'
    : goal === 'hypertrophy'
      ? '- Main compounds: 4 sets of 6-10 reps, 90-120s rest\n- Isolation: 3 sets of 10-15 reps, 60-90s rest'
      : '- All exercises: 2-3 sets of 15-20 reps, 30-45s rest';

  const [minEx, maxEx] = exerciseCount.split('-').map(n => parseInt(n));

  // Exercises already used on OTHER days of this program — so two same-type days
  // (e.g. two push days) don't end up near-copies of each other.
  const avoidBlock = (avoidExercises && avoidExercises.length)
    ? `\n=== ALREADY USED ON OTHER DAYS (DO NOT REUSE) ===\nThese exercises are already in this program on other days: ${avoidExercises.join(', ')}.\n- Do NOT use any of them again. Pick DIFFERENT movements that train the same muscles.\n- Rotate equipment and angle (barbell ↔ dumbbell ↔ cable ↔ machine, flat ↔ incline) so this day looks clearly different from the others.\n`
    : '';

  // The coach's free-text notes + preferences from the AI modal. These were
  // buried at the bottom of the prompt and got ignored on some days — surface
  // them as a hard, top-of-prompt mandate so they're honored on EVERY day.
  const clientRequestsBlock = (injuries || preferences)
    ? `\n=== ⛔ COACH'S EXPLICIT INSTRUCTIONS — APPLY TO EVERY DAY (MANDATORY) ===
The coach typed these for THIS client. They are non-negotiable and override variety, defaults, and your own opinion. They apply to this day and every other day of the program, not just day 1.${injuries ? `\n- NOTES / LIMITATIONS: "${injuries}"\n  → Treat as hard constraints. NEVER include an exercise that conflicts with or could aggravate these; substitute a safe alternative.` : ''}${preferences ? `\n- PREFERENCES: "${preferences}"\n  → Follow exactly. If a preference names a movement, style, or thing to include or avoid, honor it on this day too.` : ''}\n`
    : '';

  // ── Session duration → time-budget + scaled phases ──────────────────────────
  // Make the whole workout actually fit the chosen minutes. Short sessions trim
  // warm-up/cool-down and exercise count; long ones get the full structure.
  const sd = parseInt(sessionDuration) || 60;
  let warmupLine, mainLine, cooldownLine, budgetLine;
  if (sd <= 22) {
    budgetLine = `=== TIME BUDGET: ~${sd} MIN TOTAL (SHORT SESSION) ===\nThis client is short on time. The ENTIRE session (warm-up + work + cool-down) must fit in about ${sd} minutes. Keep it tight and efficient.`;
    warmupLine = `PHASE 1 — QUICK WARM-UP (1-2 min): just 1 short dynamic/cardio movement. Mark "isWarmup": true, "phase": "warmup".`;
    mainLine = `PHASE 2 — MAIN WORKOUT: only 3-4 main exercises, shorter rest (30-45s). Pairing exercises into supersets to save time is encouraged. Mark "phase": "main".`;
    cooldownLine = `PHASE 3 — COOL-DOWN: 1 quick stretch only (or omit). Mark "isStretch": true, "phase": "cooldown".`;
  } else if (sd <= 35) {
    budgetLine = `=== TIME BUDGET: ~${sd} MIN TOTAL ===\nKeep the whole session to about ${sd} minutes.`;
    warmupLine = `PHASE 1 — WARM-UP (5 min): 1 short cardio + 1 dynamic prep. Mark "isWarmup": true, "phase": "warmup".`;
    mainLine = `PHASE 2 — MAIN WORKOUT: 4-5 main exercises. Mark "phase": "main".`;
    cooldownLine = `PHASE 3 — COOL-DOWN (3-4 min): 1-2 static stretches. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".`;
  } else if (sd <= 50) {
    budgetLine = `=== TIME BUDGET: ~${sd} MIN TOTAL ===\nAim for about ${sd} minutes total.`;
    warmupLine = `PHASE 1 — WARM-UP (5 min): 1 cardio (5 min) + 1 dynamic prep. Mark "isWarmup": true, "phase": "warmup". Cardio reps in TIME format ("5 min").`;
    mainLine = `PHASE 2 — MAIN WORKOUT: ${Math.max(5, minEx || 5)}-${Math.max(6, maxEx || 6)} main exercises. Mark "phase": "main".`;
    cooldownLine = `PHASE 3 — COOL-DOWN (5 min): 2 static stretches matching trained muscles. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".`;
  } else {
    budgetLine = `=== TIME BUDGET: ~${sd} MIN TOTAL ===\nA full session of about ${sd} minutes.`;
    warmupLine = `PHASE 1 — WARM-UP (5-8 min): 1 cardio (5 min) + 1-2 dynamic prep. Mark "isWarmup": true, "phase": "warmup". Cardio reps in TIME format ("5 min").`;
    mainLine = `PHASE 2 — MAIN WORKOUT: ${minEx}-${maxEx} main exercises. Mark "phase": "main".`;
    cooldownLine = `PHASE 3 — COOL-DOWN (5-7 min): 2-3 static stretches matching trained muscles. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".`;
  }
  const phasesBlock = `${budgetLine}\n\n=== MANDATORY WORKOUT PHASES ===\n${warmupLine}\n${mainLine}\n${cooldownLine}`;

  // ── Training style (straight sets / supersets / circuits / mixed) ────────────
  const styleMap = {
    straight_sets: 'STRAIGHT SETS: every exercise stands alone — set "isSuperset": false and "supersetGroup": null on all of them.',
    supersets: 'SUPERSETS: pair MOST main exercises. Each pair shares the SAME "supersetGroup" letter ("A","B",…), sits consecutively, and has "isSuperset": true. Prefer antagonist pairings (e.g. push with pull).',
    circuits: 'CIRCUITS: group 3-5 main exercises into a circuit — give them all the same "supersetGroup" letter and "isSuperset": true.',
    mixed: 'MIXED: mostly straight sets plus 1-2 superset pairs — mark only the paired ones "isSuperset": true with a matching "supersetGroup" letter.'
  };
  const styleBlock = `=== TRAINING STYLE ===\n${styleMap[trainingStyle] || styleMap.straight_sets}`;

  // ── Conditioning finisher (fires whenever the coach picked one) ──────────────
  // Names REAL library moves (exact DB names, with videos) from the injury+
  // equipment-filtered pool so the finisher renders with a video, and overrides
  // the "cardio only in warm-up" rule so the prompt stops contradicting itself.
  // See utils/finisher.js.
  const conditioningBlock = buildConditioningFinisher({
    conditioningStyle,
    pool: exercisesAfterInjuries,
    equipment
  });

  // ── Focus areas (extra priority) ────────────────────────────────────────────
  const focusBlock = (Array.isArray(focusAreas) && focusAreas.length)
    ? `\n=== FOCUS AREAS (EXTRA PRIORITY) ===\nThe coach wants extra emphasis on: ${focusAreas.join(', ')}. Where these fit THIS day's muscle group, bias exercise selection and add a little volume toward them (an extra exercise or set), without neglecting the rest of the day.`
    : '';

  const systemPrompt = `You are an elite strength & conditioning coach with 20+ years of experience. Return ONLY valid JSON, no markdown.

Create a single ${muscleLabel} workout for an ${experience}-level trainee optimized for ${goal}.
${strictSplitConstraint}
${keepMandate}
${clientRequestsBlock}
=== WEIGHTS / LOADS (MANDATORY) ===
NEVER write specific weights or loads (e.g. "45 lb", "20 kg", "use 70%", "you hit 50 lb last time") in any "notes" field. The app has a built-in weight tracker that suggests and logs the client's working weights — duplicating numbers in notes conflicts with it. Notes are for form cues, tempo, RPE/RIR and rep targets only.
${availableExercisesPrompt}
${clientContextBlock}
${avoidBlock}
${phasesBlock}

${styleBlock}
${focusBlock}
${conditioningBlock}

=== EXERCISE ORDER WITHIN THE MAIN BLOCK (MANDATORY — this is what separates a real coach from a list of exercises) ===
Order the MAIN exercises by how heavy and technically demanding they are, HARDEST FIRST while the client is freshest. The sequence must be:
1. Heaviest compound first (e.g. barbell/dumbbell press BEFORE any fly; squat/deadlift/hip-hinge BEFORE leg curl/extension; row/pulldown BEFORE rear-delt or biceps work).
2. Secondary compounds next.
3. Machine and isolation work after the free-weight compounds.
4. Flyes, raises, cable/pump work, and any finisher LAST.
NEVER place an isolation or fly movement before a compound that trains the same muscle. A fly before the press, or a leg extension before the squat, is a programming error — re-order before returning. When supersetting, the heaviest compound may stay as a straight set at the front; pair the lighter accessories.
- VARIETY OF MOVEMENT, NOT REPETITION: do NOT program more than 2 of the same movement pattern in one session (e.g. never incline fly + pec deck + flat fly together — two flye variations is the max; same for three different presses or three different curls).
- KEEP VOLUME SANE: aim for roughly 12-18 hard working sets for any single muscle in one focused session, not 20+. More sets is not better; quality over pile-on.

=== INTENSITY & TEMPO ===
${tempoInstruction}
${intensityInstruction}
${unilateralInstruction}

=== REP RANGES (goal: ${goal}) ===
${repRangeBlock}

=== EXERCISE SELECTION ===
- Use EXACT names from the AVAILABLE EXERCISES DATABASE.
- NEVER invent or modify names.
- CROSS-DAY VARIETY: Never reuse an exercise that appears on another day training the same muscles (see ALREADY USED list above). Two same-type days must look clearly different — different primary lift and different accessories — not copies. Rotate equipment and angle to spread stimulus and reduce joint wear.
- DO NOT auto-default to textbook lifts (barbell bench press, back squat, conventional deadlift) just because they are "standard". Choose the primary from the client's history, equipment, and variety — a good coach rotates primaries, they don't reflexively program barbell bench every chest day.
- KEEP WHAT'S WORKING: If a CLIENT BRIEFING exercise is tagged "KEEP+PROGRESS" (the client is still PRing / adding reps) and it is in your AVAILABLE EXERCISES list and NOT in the ALREADY USED list, you MUST include that exact exercise as a primary. Never replace a lift the client is progressing on with a generic substitute.
- CARDIO MACHINES (treadmill, stairmaster, bike, rower, elliptical) belong ONLY in warm-up, NEVER as main strength work. ONE exception: if the CLIENT PROFILE's goal details name a running or endurance event (marathon, race, 5k/10k), add a real running/conditioning block at the END of the day with "phase": "conditioning" (e.g. 15-20 min treadmill run, reps in TIME format) on the days where it fits — that goal must actually be trained.
- The "notes" field is shown to the CLIENT — write a normal coaching cue only. NEVER put internal labels (KEEP+PROGRESS, SWAP, PERSIST, ROTATE, REGRESSED, briefing text, or emoji) in notes, and NEVER put weights/loads in notes (e.g. "you hit 50 lb last time", "start around 45 lb") — the app tracks weights for the client.
- For LEG days: include squat + hip hinge + hamstring iso + calf + ideally glute-specific.

=== COACHING NOTES — WRITE THEM LIKE THE COACH TEXTED THEM (NOT AI) ===
The "notes" cue is shown to the CLIENT. It must read like their real coach typed it on their phone, not like AI. Voice rules (NON-NEGOTIABLE):
- ALL LOWERCASE. every letter, including the first word of every sentence. no capital letters at all, ever.
- NO em dashes or en dashes (the "—" or "–" character). use commas, periods, or just shorter sentences.
- short, warm, human. contractions are good ("don't", "you'll", "it's"). NO corporate/AI filler: never write "engage your core", "ensure proper form", "maintain", "throughout the movement", "optimal", "elevate", "focus on".
EVERY CUE MUST BE DIFFERENT — coaches hate AI reusing one formula ("control the eccentric, squeeze at the top, no swinging") with the nouns swapped:
- Rotate WHAT each cue is about: setup / foot or hand position, breathing or bracing, tempo, the single most common mistake on THIS lift, what it should FEEL like or which muscle to feel, range of motion, effort target ("last couple reps should be a grind"), or a quick mindset line. Don't use the same angle twice in a row, and don't start two notes with the same word.
- Make each cue SPECIFIC to that exact movement. a split squat cue should not be swappable onto a row. if a note could be pasted onto another exercise unnoticed, rewrite it.
- Use auto-pilot phrases ("control the eccentric", "squeeze at the top", "no swinging", "full range of motion") at most ONCE in the whole day, and only when it's genuinely the key point.
PERSONAL TOUCH — MAKE IT FEEL MADE FOR THEM: the CLIENT PROFILE above has real detail (their training history, lifts they're progressing on, injuries, how often they train). On the MAIN exercises where you actually know something about THIS client, work it into the cue so they feel seen — e.g. "this has been a staple for you, let's keep building it", "you've been moving well here, chase one more rep than last time", or "keeping these controlled so that shoulder stays happy". Aim for ABOUT 2-3 genuinely personal cues per workout (not every exercise, and skip warm-ups/stretches). Vary how you do it so they don't all read the same. NEVER invent a detail that isn't in the profile, and NEVER put weights or numbers in a cue.

CONSTRAINTS:
- Equipment: ${equipment.join(', ')}
${injuries ? `- Remember the coach's NOTES/LIMITATIONS above — apply them here.` : ''}
${preferences ? `- Remember the coach's PREFERENCES above — apply them here.` : ''}
${warmupStretchInstructions}

Return this exact JSON structure:
{
  "name": "${daySpec.dayName}",
  "targetMuscles": ["muscle1"],
  "exercises": [
    {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
    {"name": "Main Exercise", "muscleGroup": "primary", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "drive through your heels and keep your chest tall coming up", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
    {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
  ]
}`;

  const userMessage = `Create a single ${muscleLabel} workout. Return ONLY the day JSON.${injuries ? ` Honor the coach's notes/limitations: "${injuries}".` : ''}${preferences ? ` Honor the coach's preferences: "${preferences}".` : ''}`;

  // Quality tier model (Sonnet by default, Opus for the "Best" tier). Slow but
  // accurate — the background function gives us up to 15 min total.
  const message = await anthropic.messages.create({
    model: model || 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userMessage }],
    system: systemPrompt
  });

  const responseText = message.content[0]?.text || '';
  let dayData;
  try { dayData = JSON.parse(responseText.trim()); }
  catch {
    const m = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) dayData = JSON.parse(m[1].trim());
    else {
      const o = responseText.match(/\{[\s\S]*\}/);
      if (o) dayData = JSON.parse(o[0]);
      else throw new Error(`Day ${daySpec.dayNumber}: could not parse JSON`);
    }
  }

  // Match exercises to DB
  const matched = (dayData.exercises || []).map(ex => {
    if (!ex.name) return null;
    ex.name = (ex.name || '').replace(/\s*\(custom\)\s*$/i, '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
    if (typeof ex.sets !== 'number' || ex.sets < 1) ex.sets = 3;
    if (!ex.reps) ex.reps = '8-12';
    if (typeof ex.restSeconds !== 'number') ex.restSeconds = 60;
    ex.notes = humanizeCue(ex.notes); // coach voice: lowercase, no em dashes
    const isWarmStretch = ex.isWarmup || ex.isStretch;
    // Main exercises must resolve only to equipment the coach allows — matching
    // against the full library is how mislabeled gear leaked into the result
    // even after the candidate pool was filtered. Warm-ups/stretches still match
    // the full pool (they're bodyweight by nature and detected by name).
    const pool = isWarmStretch
      ? exercisesWithVideos
      : exercisesAfterInjuries.filter(candidate => exerciseMatchesEquipment(candidate, equipment));
    const m = findBestMatch(ex.name, pool);
    if (m) {
      return {
        ...ex,
        id: m.id,
        name: m.name,
        video_url: m.video_url,
        animation_url: m.animation_url,
        thumbnail_url: m.thumbnail_url,
        muscle_group: m.muscle_group,
        equipment: m.equipment,
        instructions: m.instructions,
        isCustom: !!m.coach_id,
        matched: true
      };
    }
    return { ...ex, muscle_group: ex.muscleGroup, matched: false };
  }).filter(Boolean);

  // Auto-fix split violations
  let removedViolations = [];
  if (targetMuscle === 'push' || targetMuscle === 'pull') {
    const kept = [];
    for (const ex of matched) {
      // Warm-ups, stretches, and the conditioning finisher are deliberately off
      // the muscle split — never strip them as a "wrong movement".
      if (ex.isWarmup || ex.isStretch || ex.phase === 'conditioning') { kept.push(ex); continue; }
      const n = (ex.name || '').toLowerCase();
      const mg = (ex.muscle_group || '').toLowerCase();
      let violation = null;
      if (targetMuscle === 'push') {
        if (/\b(curl|row|pulldown|pull-down|pullup|pull-up|chinup|chin-up|face pull|shrug|deadlift|pullover)\b/.test(n)) violation = 'pull movement on push day';
        else if (/\b(back|biceps?|lats?|rhomboid|trap)\b/.test(mg) && !/(rear delt|trap.*shoulder)/i.test(mg)) violation = `${mg} on push day`;
      } else if (targetMuscle === 'pull') {
        if (/\b(bench press|chest press|incline press|decline press|fly|flye|dip|push-up|pushup|tricep|skull crusher|pushdown|kickback|overhead press|military press|shoulder press|arnold press|push press)\b/.test(n)) violation = 'push movement on pull day';
        else if (/\b(chest|pec|tricep|triceps)\b/.test(mg)) violation = `${mg} on pull day`;
      }
      if (violation) removedViolations.push({ exercise: ex.name, reason: violation, autoRemoved: true });
      else kept.push(ex);
    }
    return {
      dayNumber: daySpec.dayNumber,
      name: daySpec.dayName,
      targetMuscles: dayData.targetMuscles || [targetMuscle],
      exercises: kept,
      violations: removedViolations
    };
  }

  return {
    dayNumber: daySpec.dayNumber,
    name: daySpec.dayName,
    targetMuscles: dayData.targetMuscles || [targetMuscle],
    exercises: matched,
    violations: []
  };
}

// ─── Keep-what's-working enforcement (deterministic) ──────────────────────────
// The prompt ASKS the model to keep lifts the client is actively progressing on,
// but a soft instruction loses to the model's "rotate for variety" instinct — it
// dropped a client's only two progressing lifts even when explicitly mandated.
// This pass GUARANTEES it: after generation, any progress_load lift that fits a
// day's muscle target but is missing gets injected, replacing a same-muscle
// accessory the client is NOT progressing on. Runs before multi-week progression
// so kept lifts propagate to every week.
function exCategory(mg, name) {
  const g = (mg || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (/\bcurl\b/.test(n) && !/leg curl/.test(n)) return 'biceps';
  if (/tricep|push ?down|skull|kickback|close grip|\bdip\b|overhead extension|french press/.test(n)) return 'triceps';
  if (/bicep/.test(g)) return 'biceps';
  if (/tricep/.test(g)) return 'triceps';
  if (/chest|pec/.test(g)) return 'chest';
  if (/back|lat|trap|rhomboid|rear delt/.test(g)) return 'back';
  if (/shoulder|delt/.test(g)) return 'shoulders';
  if (/glute/.test(g)) return 'glutes';
  if (/quad|hamstring|calf|calves|\bleg|adductor|abductor/.test(g)) return 'legs';
  if (/core|\bab\b|abs|oblique/.test(g)) return 'core';
  if (/arm|forearm/.test(g)) return 'biceps'; // generic 'arms' w/o a triceps cue → curls
  return 'other';
}
function dayAcceptsCategory(targetMuscle, cat) {
  const t = (targetMuscle || '').toLowerCase();
  if (t === 'full_body' || t === 'full') return cat !== 'other';
  if (t === 'upper_body' || t === 'upper') return ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(cat);
  if (t === 'lower_body' || t === 'lower' || t === 'legs') return ['legs', 'glutes'].includes(cat);
  if (t === 'push') return ['chest', 'shoulders', 'triceps'].includes(cat);
  if (t === 'pull') return ['back', 'biceps'].includes(cat);
  if (t === 'arms') return ['biceps', 'triceps'].includes(cat);
  return t === cat; // bro-split single-muscle days (chest/back/shoulders/legs/core)
}
// Rotate the injected keeper cue — a single hardcoded sentence repeated 3-4
// times inside one program reads exactly like the AI template the cue rules
// forbid. Picked deterministically off the exercise name so re-runs are stable.
const KEEPER_NOTES = [
  'you\'ve been making real progress here, so keep chasing a little more each week.',
  'this one\'s been climbing for you, keep riding it. same clean form, nudge it forward.',
  'we\'re keeping this in because it\'s working. stay patient and keep stacking small wins on it.',
  'your numbers on this have been trending up, so don\'t change a thing. just keep showing up for it.',
  'this lift is one of your best movers right now, protect that momentum.',
  'still moving up on this one, love to see it. keep the reps honest and let it build.'
];
function buildKeeperExercise(lib, template) {
  const t = template || {};
  const noteIdx = (lib.name || '').length % KEEPER_NOTES.length;
  return {
    name: lib.name,
    muscleGroup: lib.muscle_group,
    sets: typeof t.sets === 'number' ? t.sets : 4,
    reps: t.reps || '8-10',
    restSeconds: typeof t.restSeconds === 'number' ? t.restSeconds : 90,
    notes: KEEPER_NOTES[noteIdx],
    isSuperset: false, supersetGroup: null, isWarmup: false, isStretch: false, phase: 'main',
    id: lib.id, video_url: lib.video_url, animation_url: lib.animation_url,
    thumbnail_url: lib.thumbnail_url, muscle_group: lib.muscle_group, equipment: lib.equipment,
    instructions: lib.instructions, isCustom: !!lib.coach_id, matched: true, isKeeper: true
  };
}
function enforceProgressKeepers(keepers, days, splitDays, pool) {
  if (!Array.isArray(keepers) || keepers.length === 0) return [];
  const injected = [];
  const targetByDayNumber = {};
  splitDays.forEach(sd => { targetByDayNumber[sd.dayNumber] = sd.targetMuscle; });
  const present = new Set();
  for (const d of days) for (const ex of (d.exercises || [])) if (ex?.name) present.add(normalizeName(ex.name));
  // Never let one keeper evict another lift the client is also progressing on.
  const keeperNames = new Set(keepers.map(k => normalizeName(k.name)));

  for (const keeper of keepers) {
    const lib = pool.find(e => normalizeName(e.name) === normalizeName(keeper.name));
    if (!lib) continue;                                   // not in the equipment/injury-safe, has-video pool
    if (present.has(normalizeName(lib.name))) continue;   // model already kept it — nothing to do
    const cat = exCategory(lib.muscle_group, lib.name);

    // Days whose target accepts this muscle. Fewest keepers first so two keepers
    // for the same region spread across the two same-type days instead of stacking.
    const candidates = days
      .map(d => ({ d, target: targetByDayNumber[d.dayNumber] }))
      .filter(c => dayAcceptsCategory(c.target, cat))
      .sort((a, b) => a.d.exercises.filter(e => e.isKeeper).length - b.d.exercises.filter(e => e.isKeeper).length);
    if (candidates.length === 0) continue;
    const targetDay = candidates[0].d;
    const mains = targetDay.exercises;

    // Victim: the last same-category MAIN exercise the client is NOT progressing on
    // (accessories sit later in the day, so last = most expendable).
    let victimIdx = -1;
    for (let i = mains.length - 1; i >= 0; i--) {
      const ex = mains[i];
      if (ex.isWarmup || ex.isStretch || ex.isKeeper) continue;
      if (keeperNames.has(normalizeName(ex.name))) continue;
      if (exCategory(ex.muscle_group || ex.muscleGroup, ex.name) === cat) { victimIdx = i; break; }
    }
    const tmpl = victimIdx >= 0 ? mains[victimIdx] : mains.find(e => !e.isWarmup && !e.isStretch) || {};
    const keeperEx = buildKeeperExercise(lib, tmpl);

    if (victimIdx >= 0) {
      injected.push({ kept: lib.name, day: targetDay.name, replaced: mains[victimIdx].name });
      mains[victimIdx] = keeperEx;
    } else {
      // No same-muscle accessory to swap — add it as main work, before the stretches.
      let insertAt = mains.findIndex(e => e.isStretch);
      if (insertAt < 0) insertAt = mains.length;
      mains.splice(insertAt, 0, keeperEx);
      injected.push({ kept: lib.name, day: targetDay.name, replaced: null });
    }
    present.add(normalizeName(lib.name));
  }
  return injected;
}

// ─── Main background handler ──────────────────────────────────────────────────
exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!ANTHROPIC_API_KEY || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const {
    jobId, coachId, clientId = null, clientName = 'Client',
    goal = 'hypertrophy', experience = 'intermediate',
    daysPerWeek = 4, duration = 4, split = 'auto', sessionDuration = 60,
    trainingStyle = 'straight_sets', exerciseCount = '5-6',
    focusAreas = [], equipment = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
    injuries = '', injuryCodes = [], movementScreenFlags = [], preferences = '',
    tempo = 'standard', rpeTarget = null, rirTarget = null,
    unilateralPreference = 'mixed', conditioningStyle = 'none',
    includeProgression = true, varietySeed = Date.now(),
    model = 'claude-sonnet-4-5'
  } = body;

  if (!jobId || !coachId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId and coachId are required' }) };
  }

  // Allowlist the generation model — only the two tiers the UI offers. Anything
  // else (or a typo) falls back to Sonnet rather than erroring or hitting an
  // unexpected/unbilled model.
  const genModel = ['claude-opus-4-8', 'claude-sonnet-4-5'].includes(model) ? model : 'claude-sonnet-4-5';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await ensureBucket(supabase);

  // Mark as queued before kicking off (so the polling endpoint sees something)
  try {
    await writeJob(supabase, coachId, jobId, {
      status: 'queued',
      progress: { totalDays: daysPerWeek, completedDays: 0 },
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Initial writeJob failed:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to initialize job storage' }) };
  }

  // From here on, we run async (Netlify ignores response since this is a background function).
  // Wrap everything in try/catch so failures get persisted to storage.
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const allExercises = await loadExercises(supabase, coachId);
    let exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);
    // Merge per-generation flags with the client's stored health_flags so
    // permanent injuries always apply even if the coach didn't manually check
    // anything in the modal. Also pull the client's unavailable-equipment list
    // (gear their gym doesn't have) — Bulk AI passes no equipment restrictions
    // of its own, so without this the pool assumes a fully equipped gym and
    // programs gear the client has explicitly said they don't have.
    let mergedInjuryCodes = Array.isArray(injuryCodes) ? injuryCodes.slice() : [];
    let mergedMovementFlags = Array.isArray(movementScreenFlags) ? movementScreenFlags.slice() : [];
    let clientUnavailableEquipment = [];
    let clientGoalDetails = '';
    if (clientId) {
      try {
        const { data: hfRow } = await supabase.from('clients').select('health_flags, unavailable_equipment').eq('id', clientId).maybeSingle();
        const hf = hfRow?.health_flags || {};
        if (Array.isArray(hf.injuryCodes)) mergedInjuryCodes = [...new Set([...mergedInjuryCodes, ...hf.injuryCodes])];
        if (Array.isArray(hf.movementFlags)) mergedMovementFlags = [...new Set([...mergedMovementFlags, ...hf.movementFlags])];
        let unavail = hfRow?.unavailable_equipment;
        if (typeof unavail === 'string') { try { unavail = JSON.parse(unavail); } catch { unavail = []; } }
        if (Array.isArray(unavail)) clientUnavailableEquipment = unavail.filter(Boolean);
      } catch (e) { /* ignore */ }
    }
    // Filter at the top of the funnel so every downstream pool (candidate list,
    // warm-ups, stretches, name-matching) inherits the restriction.
    exercisesWithVideos = filterUnavailableEquipment(exercisesWithVideos, clientUnavailableEquipment);

    let exercisesAfterInjuries = applyInjuryExclusions(exercisesWithVideos, mergedInjuryCodes);
    exercisesAfterInjuries = applyMovementScreenExclusions(exercisesAfterInjuries, mergedMovementFlags);

    // Equipment filter — name-aware (the equipment column is unreliable; see
    // utils/equipment-filter.js). Keeps mislabeled gear out of the candidate
    // pool the AI sees.
    const equipmentFiltered = exercisesAfterInjuries.filter(ex => exerciseMatchesEquipment(ex, equipment));

    // Group + sample 25 per group
    const byGroup = {};
    for (const ex of equipmentFiltered) {
      const g = (ex.muscle_group || 'other').toLowerCase();
      if (!byGroup[g]) byGroup[g] = [];
      const eq = ex.equipment ? ` [${ex.equipment}]` : '';
      const cu = ex.coach_id ? ' (custom)' : '';
      byGroup[g].push({ name: `${ex.name}${eq}${cu}`, raw: ex });
    }
    const sampled = {};
    let idx = 0;
    for (const [g, list] of Object.entries(byGroup)) {
      sampled[g] = sampleArray(list, 25, varietySeed + (idx++ * 7919)).map(s => s.name);
    }

    // Warmup/stretch reference lists
    const allNames = exercisesWithVideos.map(e => e.name);
    const warmupSuitable = allNames.filter(n => /jump|jack|burpee|mountain climber|high knee|butt kick|arm circle|leg swing|hip circle|torso twist|march|skip|jog/i.test(n)).slice(0, 8);
    const stretchExercises = allNames.filter(n => /stretch/i.test(n)).slice(0, 20);

    // Rich client context: profile + 30 days of training logs + top exercises +
    // last assigned program + coach notes. The whole point of picking a client
    // is to personalize the program from this data.
    let clientContextBlock = '';
    let clientContextSummary = null;
    let clientHealthFlags = {};
    let clientWeightUnit = 'lb'; // 'kg' for metric clients — all loads written in this
    if (clientId) {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const [clientRes, logsRes, lastAssignmentRes] = await Promise.all([
          supabase.from('clients')
            .select('id, client_name, age, gender, height_ft, height_in, weight, default_goal, fitness_level, health_concerns, equipment_access, exercise_frequency, notes, health_flags, fitness_goal_details, unit_preference')
            .eq('id', clientId).maybeSingle(),
          supabase.from('workout_logs')
            .select('id, workout_date, duration_minutes, energy_level, workout_rating')
            .eq('client_id', clientId)
            .gte('workout_date', thirtyDaysAgo)
            .order('workout_date', { ascending: false })
            .limit(20),
          supabase.from('client_workout_assignments')
            .select('name, start_date, end_date, is_active, created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle()
        ]);

        const client = clientRes.data;
        if (client?.unit_preference === 'metric') clientWeightUnit = 'kg';
        if (client?.fitness_goal_details) clientGoalDetails = String(client.fitness_goal_details);
        const recentLogs = logsRes.data || [];
        const intake = null;
        const lastProgram = lastAssignmentRes.data || null;
        clientHealthFlags = client?.health_flags || {};

        // Per-exercise progress: top weight, sessions, PRs in last 30 days
        let exerciseHistory = [];
        if (recentLogs.length > 0) {
          const logIds = recentLogs.map(l => l.id);
          const { data: exLogs } = await supabase.from('exercise_logs')
            .select('exercise_name, max_weight, total_volume, total_sets, total_reps, is_pr')
            .in('workout_log_id', logIds)
            .limit(300);
          if (exLogs) {
            const byName = {};
            for (const ex of exLogs) {
              if (!byName[ex.exercise_name]) byName[ex.exercise_name] = { topWeight: 0, sessions: 0, prs: 0, totalVolume: 0 };
              byName[ex.exercise_name].topWeight = Math.max(byName[ex.exercise_name].topWeight, ex.max_weight || 0);
              byName[ex.exercise_name].totalVolume += ex.total_volume || 0;
              byName[ex.exercise_name].sessions++;
              if (ex.is_pr) byName[ex.exercise_name].prs++;
            }
            exerciseHistory = Object.entries(byName)
              .sort((a, b) => b[1].sessions - a[1].sessions)
              .slice(0, 12);
          }
        }

        // workout_rating (1-5 scale) is the closest field to RPE we have.
        // Convert to a 0-10 scale by multiplying by 2 so the rest of the
        // analyzer's RPE thresholds (high >=8.5, low <=6) still make sense.
        const ratingsValid = recentLogs.filter(l => l.workout_rating);
        const avgRPE = ratingsValid.length > 0
          ? (ratingsValid.reduce((s, l) => s + (l.workout_rating || 0), 0) / ratingsValid.length) * 2
          : null;

        if (client) {
          const lines = ['\n=== CLIENT PROFILE (use this to personalize the program) ==='];
          if (client.client_name) lines.push(`Name: ${client.client_name}`);
          if (client.age) lines.push(`Age: ${client.age}`);
          if (client.gender) lines.push(`Gender: ${client.gender}`);
          if (client.height_ft) lines.push(`Height: ${client.height_ft}'${client.height_in || 0}"`);
          if (client.weight) lines.push(`Weight: ${client.weight} ${clientWeightUnit}`);
          if (client.default_goal) lines.push(`Stated goal: ${client.default_goal}`);
          if (client.fitness_goal_details) {
            lines.push(`Goal details: ${client.fitness_goal_details}`);
            lines.push(`  → SPECIFIC GOALS ARE PROGRAMMING TARGETS, not flavor text. If the goal details name a concrete skill, event, or lift (e.g. unassisted pull-ups, a race/marathon, a strength number), the program MUST train it directly on the days where it fits: a pull-up goal needs an actual pull-up progression (assisted pull ups, negatives, pulldown strength work) as main exercises; a running/endurance event needs real running or conditioning blocks, not just a cardio warm-up. Mentioning the goal in a note without programming for it is a failure.`);
          }
          if (client.fitness_level) lines.push(`Fitness level: ${client.fitness_level}`);
          if (client.health_concerns) lines.push(`Logged injuries / health concerns: ${client.health_concerns}`);
          if (client.equipment_access) lines.push(`Equipment access: ${client.equipment_access}`);
          if (clientUnavailableEquipment.length) lines.push(`Equipment NOT available at this client's gym: ${clientUnavailableEquipment.join(', ')} — these are already removed from your exercise list; never work around it by naming them in notes.`);
          if (client.exercise_frequency) lines.push(`Exercise frequency: ${client.exercise_frequency}`);
          if (client.notes) lines.push(`Coach notes: ${client.notes}`);
          if (clientHealthFlags?.aiNotes) lines.push(`AI-specific coach notes: ${clientHealthFlags.aiNotes}`);
          if (Array.isArray(clientHealthFlags?.injuryCodes) && clientHealthFlags.injuryCodes.length) lines.push(`Structured injuries: ${clientHealthFlags.injuryCodes.join(', ')}`);
          if (Array.isArray(clientHealthFlags?.movementFlags) && clientHealthFlags.movementFlags.length) lines.push(`Movement screen flags: ${clientHealthFlags.movementFlags.join(', ')}`);

          if (lastProgram) {
            lines.push(`\nMost recent program: "${lastProgram.name}"${lastProgram.is_active ? ' (currently active)' : ''}, started ${lastProgram.start_date || lastProgram.created_at}`);
            lines.push(`  → Build progressive overload from this program. Vary exercise selection so the client gets fresh stimulus, but keep the trajectory.`);
          }

          if (exerciseHistory.length > 0) {
            lines.push(`\nRecent training history (last 30 days, top ${exerciseHistory.length} exercises):`);
            for (const [name, data] of exerciseHistory) {
              lines.push(`  • ${name}: top ${data.topWeight} ${clientWeightUnit}, ${data.sessions} sessions${data.prs ? `, ${data.prs} PR${data.prs > 1 ? 's' : ''}` : ''}`);
            }
            lines.push(`  → Use these top weights to calibrate exercise selection and difficulty. Do NOT write weight/load numbers in the notes — the client logs and progresses their own weights in the app.`);
            lines.push(`  → Avoid stale exercises: pick variations of these movements rather than repeating the exact same exercises.`);
          }

          if (recentLogs.length > 0) {
            lines.push(`\nRecent sessions: ${recentLogs.length} in last 30 days${avgRPE ? `, average RPE ${avgRPE.toFixed(1)}` : ''}`);
            if (avgRPE && avgRPE >= 8.5) lines.push(`  → High average RPE — schedule a deload or reduce volume slightly to allow recovery.`);
            else if (avgRPE && avgRPE <= 6) lines.push(`  → Low average RPE — client has room to push intensity.`);
          } else {
            lines.push(`\nNo recent training logs — client may be returning from a layoff. Start conservatively with ~70% intensity and build up.`);
          }

          if (intake) {
            // Intake form responses are a JSON blob — pass a compact version
            const intakeStr = typeof intake === 'string' ? intake : JSON.stringify(intake).slice(0, 500);
            lines.push(`\nIntake form excerpt: ${intakeStr}`);
          }

          lines.push(`\nUse this context to: (a) calibrate weights/intensity to the client's actual top loads, (b) pick exercises that aren't stale (vary from recent), (c) progress from where the client currently is — not from scratch, (d) respect logged injuries with extra care.`);

          clientContextBlock = lines.join('\n');
          clientContextSummary = {
            clientName: client.client_name,
            sessionCount: recentLogs.length,
            avgRPE: avgRPE ? avgRPE.toFixed(1) : null,
            topExercises: exerciseHistory.slice(0, 5).map(([name, data]) => ({ name, topWeight: data.topWeight, sessions: data.sessions })),
            lastProgramName: lastProgram?.name || null,
            hasIntake: !!intake,
            hasCoachNotes: !!client.notes
          };
        }
      } catch (e) {
        console.warn('Client context fetch failed:', e.message);
      }
    }

    // Run the coach-grade analyzer on the client's history, then append its
    // briefing to the prompt. This is what makes the AI decide which
    // exercises to keep vs swap vs progress based on real performance trends.
    let clientAnalysis = null;
    if (clientId) {
      try {
        clientAnalysis = await analyzeClientHistory(supabase, clientId, { goal, weightUnit: clientWeightUnit });
        if (clientAnalysis) {
          clientContextBlock = (clientContextBlock || '') + '\n' + formatAnalysisForPrompt(clientAnalysis);
        }
      } catch (e) {
        console.warn('analyzeClientHistory failed:', e.message);
      }
    }

    // Force the client's progressing/PR lifts into the candidate pool so the model
    // can actually keep them — random sampling may otherwise drop a lift the client
    // is PRing. (Cross-day variety is still handled by the per-day avoid list.)
    if (clientAnalysis && Array.isArray(clientAnalysis.exerciseAnalysis)) {
      const keepNames = clientAnalysis.exerciseAnalysis
        .filter(e => e.action === 'progress_load')
        .map(e => e.name);
      for (const keepName of keepNames) {
        const match = equipmentFiltered.find(ex => ex.name.toLowerCase() === String(keepName).toLowerCase());
        if (!match) continue;
        const g = (match.muscle_group || 'other').toLowerCase();
        if (!sampled[g]) sampled[g] = [];
        const eq = match.equipment ? ` [${match.equipment}]` : '';
        const cu = match.coach_id ? ' (custom)' : '';
        const display = `${match.name}${eq}${cu}`;
        if (!sampled[g].some(s => s.toLowerCase().startsWith(match.name.toLowerCase()))) {
          sampled[g].unshift(display);
        }
      }
    }

    // Goal-driven pool guarantee: the "specific goals are programming targets"
    // directive can't program movements the random sampler never offered (July
    // 2026: a client with a stated pull-up goal got zero pull-up work because
    // "Assisted pull up" wasn't in the sampled candidate list). If the goal
    // names pull-ups/chin-ups, force the progressions into the pool.
    if (/pull[\s-]?ups?|chin[\s-]?ups?/i.test(clientGoalDetails)) {
      const progressions = equipmentFiltered
        .filter(ex => /pull[\s-]?up|chin[\s-]?up/i.test(ex.name || ''))
        .slice(0, 4);
      for (const match of progressions) {
        const g = (match.muscle_group || 'other').toLowerCase();
        if (!sampled[g]) sampled[g] = [];
        const eq = match.equipment ? ` [${match.equipment}]` : '';
        const cu = match.coach_id ? ' (custom)' : '';
        if (!sampled[g].some(s => s.toLowerCase().startsWith(match.name.toLowerCase()))) {
          sampled[g].unshift(`${match.name}${eq}${cu}`);
        }
      }
    }

    // Sharp, top-of-prompt MANDATE for the lifts the client is actively PRing —
    // a buried "keep what's working" bullet gets overridden by the model's own
    // priors, an explicit non-negotiable block with real numbers does not.
    let keepMandate = '';
    if (clientAnalysis && Array.isArray(clientAnalysis.exerciseAnalysis)) {
      const keepers = clientAnalysis.exerciseAnalysis.filter(e => e.action === 'progress_load');
      if (keepers.length) {
        keepMandate = `\n=== ⛔ NON-NEGOTIABLE — KEEP THESE EXACT LIFTS (client is actively PRing) ===
The client is setting personal records on these EXACT exercises. For EACH one whose muscles belong to THIS day, you MUST include it COPYING THE NAME BELOW CHARACTER-FOR-CHARACTER as a MAIN exercise. Use the EXACT lift, not a cousin: if "Machine Lateral Raise" is listed, do NOT write "Dumbbell Lateral Raise"; if "Dumbbell Chest Press Flat" is listed, do NOT write an incline/decline/machine/barbell press. The ONLY acceptable reason to deviate is a logged injury that the exact lift would aggravate — otherwise the exact name MUST appear. Build the day AROUND these; they OVERRIDE variety and your own opinion about which lift is "best":
${keepers.map(k => `- ${k.name} — ${k.reasoning}`).join('\n')}
If one does not fit today's muscle group, skip it (it belongs on another day). Otherwise it MUST appear, spelled exactly.\n`;
      }
    }

    // Compute split days
    const splitDays = computeSplitDays(daysPerWeek, split);
    const totalDays = splitDays.length;

    await writeJob(supabase, coachId, jobId, {
      status: 'running',
      progress: { totalDays, completedDays: 0 },
      startedAt: new Date().toISOString()
    });

    // Generate days SEQUENTIALLY (Sonnet is slow; running in parallel risks
    // hitting Anthropic per-account concurrency caps. Sequential is also easier
    // to report progress on.)
    const day1Workouts = [];
    const allViolations = [];
    // Track main exercises already used PER muscle-group-type, so two push days
    // (or two pull/leg days) don't end up as near-copies. Keyed by targetMuscle.
    // Upper/lower days overlap the push/pull/legs days that precede them in the
    // 5-day split, so they also avoid those types' picks (generation is
    // sequential here, so earlier days' lists are always complete).
    const RELATED_AVOID_TYPES = {
      upper_body: ['push', 'pull'],
      lower_body: ['legs'],
      legs: ['lower_body'],
      push: ['upper_body'],
      pull: ['upper_body']
    };
    const usedByType = {};
    for (const daySpec of splitDays) {
      const typeKey = daySpec.targetMuscle || daySpec.dayName;
      const avoidExercises = [
        ...(usedByType[typeKey] || []),
        ...((RELATED_AVOID_TYPES[typeKey] || []).flatMap(k => usedByType[k] || []))
      ];
      const dayResult = await generateOneDay(anthropic, {
        daySpec, exercisesByMuscleGroupSampled: sampled,
        exercisesAfterInjuries, exercisesWithVideos,
        equipment, goal, experience, sessionDuration, trainingStyle, exerciseCount,
        injuries, injuryCodes, preferences, tempo, rpeTarget, rirTarget,
        unilateralPreference, conditioningStyle, clientContextBlock,
        warmupSuitable, stretchExercises, avoidExercises, keepMandate,
        weightUnit: clientWeightUnit, model: genModel, focusAreas
      });
      // Record this day's MAIN exercises so later same-type days avoid them.
      // Accumulate same-type only — related types are unioned at read time
      // above; storing them here too would snowball the lists.
      const usedNow = (dayResult.exercises || [])
        .filter(ex => ex && !ex.isWarmup && !ex.isStretch && ex.name)
        .map(ex => ex.name);
      usedByType[typeKey] = [...(usedByType[typeKey] || []), ...usedNow];
      day1Workouts.push(dayResult);
      if (dayResult.violations?.length) {
        for (const v of dayResult.violations) allViolations.push({ ...v, day: daySpec.dayName });
      }
      // Persist progress after each day
      await writeJob(supabase, coachId, jobId, {
        status: 'running',
        progress: { totalDays, completedDays: day1Workouts.length, currentlyBuilding: null },
        partialResult: { day1Workouts: day1Workouts.length }
      });
    }

    // Deterministic guarantee: keep the lifts the client is actively progressing
    // on. The prompt mandate alone isn't reliable (the model's variety instinct
    // drops them), so force them into the right day here, before progression.
    let keeperInjections = [];
    if (clientAnalysis && Array.isArray(clientAnalysis.exerciseAnalysis)) {
      const keepers = clientAnalysis.exerciseAnalysis.filter(e => e.action === 'progress_load');
      keeperInjections = enforceProgressKeepers(keepers, day1Workouts, splitDays, equipmentFiltered);
      if (keeperInjections.length) console.log('Keeper enforcement applied:', JSON.stringify(keeperInjections));
    }

    // Assemble program
    const program = {
      programName: `${daysPerWeek}-Day ${goal.charAt(0).toUpperCase() + goal.slice(1)} Program`,
      description: `${daysPerWeek} days/week, ${duration} weeks, ${experience} level — ${genModel === 'claude-opus-4-8' ? 'Opus' : 'Sonnet'} quality`,
      goal, difficulty: experience, daysPerWeek,
      weeks: [{ weekNumber: 1, workouts: day1Workouts }]
    };

    // Multi-week progression
    if (includeProgression && duration > 1) {
      const moreWeeks = generateMultiWeekProgression(day1Workouts, duration, goal, clientWeightUnit);
      program.weeks = program.weeks.concat(moreWeeks);
    }

    // Volume summary
    const ranges = { chest: [10, 20], back: [10, 20], shoulders: [8, 18], legs: [10, 22], glutes: [8, 18], arms: [6, 16], core: [6, 16] };
    const setsByMuscle = {};
    for (const w of day1Workouts) {
      for (const ex of (w.exercises || [])) {
        if (ex.isWarmup || ex.isStretch) continue;
        const g = (ex.muscle_group || 'other').toLowerCase();
        let key = 'other';
        if (/chest|pec/.test(g)) key = 'chest';
        else if (/back|lat|trap|rhomboid/.test(g)) key = 'back';
        else if (/shoulder|delt/.test(g)) key = 'shoulders';
        else if (/leg|quad|hamstring|calf/.test(g)) key = 'legs';
        else if (/glute/.test(g)) key = 'glutes';
        else if (/bicep|tricep|arm|forearm/.test(g)) key = 'arms';
        else if (/core|ab|oblique/.test(g)) key = 'core';
        setsByMuscle[key] = (setsByMuscle[key] || 0) + (Number(ex.sets) || 0);
      }
    }
    const warnings = [];
    for (const [m, [low, high]] of Object.entries(ranges)) {
      const c = setsByMuscle[m] || 0;
      if (c > 0 && c < low) warnings.push(`${m}: only ${c} weekly sets (recommended ${low}-${high})`);
      else if (c > high) warnings.push(`${m}: ${c} weekly sets is high (recommended ${low}-${high})`);
    }

    // Match stats
    let total = 0, matched = 0;
    for (const w of day1Workouts) {
      for (const ex of (w.exercises || [])) {
        total++;
        if (ex.matched) matched++;
      }
    }

    // Final result
    await writeJob(supabase, coachId, jobId, {
      status: 'completed',
      progress: { totalDays, completedDays: totalDays },
      completedAt: new Date().toISOString(),
      result: {
        success: true,
        program,
        matchStats: {
          total, matched, unmatched: total - matched, unmatchedNames: [],
          databaseExercises: allExercises.length,
          customExerciseCount: allExercises.filter(e => e.coach_id).length,
          exercisesWithVideos: exercisesWithVideos.length
        },
        volumeSummary: { setsByMuscle, warnings },
        splitViolations: allViolations,
        keeperInjections,
        clientContextUsed: !!clientContextBlock,
        clientContextSummary,
        clientAnalysis,
        generatedWeeks: program.weeks.length,
        backgroundJob: true,
        modelUsed: genModel
      }
    });

  } catch (err) {
    console.error('Background generation failed:', err);
    try {
      await writeJob(supabase, coachId, jobId, {
        status: 'failed',
        error: err.message || String(err),
        failedAt: new Date().toISOString()
      });
    } catch (writeErr) {
      console.error('Failed to write failure status:', writeErr);
    }
  }

  // Background functions: Netlify expects 202. The async work above will keep running.
  return { statusCode: 202, headers, body: JSON.stringify({ jobId, status: 'accepted' }) };
};
