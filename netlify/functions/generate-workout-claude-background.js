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
function generateMultiWeekProgression(week1Workouts, totalWeeks, goal) {
  if (totalWeeks <= 1) return [];
  const out = [];
  for (let w = 2; w <= totalWeeks; w++) {
    const isDeload = w % 4 === 0;
    const weekIndex = w - 1;
    const workouts = week1Workouts.map(workout => {
      const exercises = (workout.exercises || []).map(ex => {
        if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown') return { ...ex };
        const baseSets = Number(ex.sets) || 3;
        const baseReps = String(ex.reps || '8-12');
        let newSets = baseSets;
        let newReps = baseReps;
        let progressNote = '';
        if (isDeload) {
          newSets = Math.max(2, baseSets - 1);
          progressNote = `Week ${w} (DELOAD): drop 1 set, use ~70% of recent working weight`;
        } else if (goal === 'strength') {
          progressNote = `Week ${w}: add 2.5-5 lb to working weight`;
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
      5: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day'], ['push', 'Push Day 2'], ['pull', 'Pull Day 2']],
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
    warmupSuitable, stretchExercises
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

  const systemPrompt = `You are an elite strength & conditioning coach with 20+ years of experience. Return ONLY valid JSON, no markdown.

Create a single ${muscleLabel} workout for an ${experience}-level trainee optimized for ${goal}.
${strictSplitConstraint}
${availableExercisesPrompt}
${clientContextBlock}

=== MANDATORY WORKOUT PHASES ===
PHASE 1 — WARM-UP (5-8 min): 1 cardio (3-5 min) + 1-2 dynamic prep. Mark "isWarmup": true, "phase": "warmup". Cardio reps in TIME format ("3 min", "5 min").
PHASE 2 — MAIN WORKOUT: ${minEx}-${maxEx} main exercises. Mark "phase": "main".
PHASE 3 — COOL-DOWN (5-7 min): 2-3 static stretches matching trained muscles. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".

=== INTENSITY & TEMPO ===
${tempoInstruction}
${intensityInstruction}
${unilateralInstruction}

=== REP RANGES (goal: ${goal}) ===
${repRangeBlock}

=== EXERCISE SELECTION ===
- Use EXACT names from the AVAILABLE EXERCISES DATABASE.
- NEVER invent or modify names.
- CARDIO MACHINES (treadmill, stairmaster, bike, rower, elliptical) belong ONLY in warm-up. NEVER as main strength.
- For LEG days: include squat + hip hinge + hamstring iso + calf + ideally glute-specific.

CONSTRAINTS:
- Equipment: ${equipment.join(', ')}
${injuries ? `- Client injuries: ${injuries} — substitute safe alternatives.` : ''}
${preferences ? `- Client preferences: ${preferences} — strictly follow.` : ''}
${warmupStretchInstructions}

Return this exact JSON structure:
{
  "name": "${daySpec.dayName}",
  "targetMuscles": ["muscle1"],
  "exercises": [
    {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
    {"name": "Main Exercise", "muscleGroup": "primary", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
    {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
  ]
}`;

  const userMessage = `Create a single ${muscleLabel} workout. Return ONLY the day JSON.`;

  // Sonnet 4.5 — slow but accurate. Background function gives us up to 15 min total.
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
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
    const isWarmStretch = ex.isWarmup || ex.isStretch;
    const pool = isWarmStretch ? exercisesWithVideos : exercisesAfterInjuries;
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
      if (ex.isWarmup || ex.isStretch) { kept.push(ex); continue; }
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
    injuries = '', injuryCodes = [], preferences = '',
    tempo = 'standard', rpeTarget = null, rirTarget = null,
    unilateralPreference = 'mixed', conditioningStyle = 'none',
    includeProgression = true, varietySeed = Date.now()
  } = body;

  if (!jobId || !coachId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId and coachId are required' }) };
  }

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
    const exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);
    const exercisesAfterInjuries = applyInjuryExclusions(exercisesWithVideos, injuryCodes);

    // Equipment filter
    const matchesEquipment = (ex) => {
      const e = (ex.equipment || '').toLowerCase();
      if (!equipment || equipment.length === 0) return true;
      return equipment.some(eq => {
        const x = eq.toLowerCase();
        if (x === 'bodyweight') return !e || e === 'none' || e === 'bodyweight' || e === 'body weight';
        if (x === 'bands') return e.includes('band');
        if (x === 'pullup_bar') return e.includes('pull-up') || e.includes('pullup') || e.includes('pull up');
        return e.includes(x);
      });
    };
    const equipmentFiltered = exercisesAfterInjuries.filter(matchesEquipment);

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

    // Client context block
    let clientContextBlock = '';
    if (clientId) {
      try {
        const { data: client } = await supabase.from('clients')
          .select('client_name, age, gender, goal, fitness_level, injuries')
          .eq('id', clientId).maybeSingle();
        if (client) {
          const lines = ['\n=== CLIENT PROFILE ==='];
          if (client.client_name) lines.push(`Name: ${client.client_name}`);
          if (client.age) lines.push(`Age: ${client.age}`);
          if (client.gender) lines.push(`Gender: ${client.gender}`);
          if (client.goal) lines.push(`Goal: ${client.goal}`);
          if (client.fitness_level) lines.push(`Level: ${client.fitness_level}`);
          if (client.injuries) lines.push(`Injuries: ${client.injuries}`);
          clientContextBlock = lines.join('\n');
        }
      } catch (e) { /* ignore */ }
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
    for (const daySpec of splitDays) {
      const dayResult = await generateOneDay(anthropic, {
        daySpec, exercisesByMuscleGroupSampled: sampled,
        exercisesAfterInjuries, exercisesWithVideos,
        equipment, goal, experience, sessionDuration, trainingStyle, exerciseCount,
        injuries, injuryCodes, preferences, tempo, rpeTarget, rirTarget,
        unilateralPreference, conditioningStyle, clientContextBlock,
        warmupSuitable, stretchExercises
      });
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

    // Assemble program
    const program = {
      programName: `${daysPerWeek}-Day ${goal.charAt(0).toUpperCase() + goal.slice(1)} Program`,
      description: `${daysPerWeek} days/week, ${duration} weeks, ${experience} level — Sonnet quality`,
      goal, difficulty: experience, daysPerWeek,
      weeks: [{ weekNumber: 1, workouts: day1Workouts }]
    };

    // Multi-week progression
    if (includeProgression && duration > 1) {
      const moreWeeks = generateMultiWeekProgression(day1Workouts, duration, goal);
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
        clientContextUsed: !!clientContextBlock,
        generatedWeeks: program.weeks.length,
        backgroundJob: true,
        modelUsed: 'claude-sonnet-4-5'
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
