// Netlify Function for AI workout program generation using Claude
// Major rewrite — supports:
//   • Custom (coach-owned) exercises in addition to global library
//   • Multi-week periodization with progressive overload
//   • Client-aware generation (intake form, recent logs, injury history)
//   • Structured injury contraindications (deterministic exclusions)
//   • Tempo, RPE/RIR, unilateral preference, conditioning modes
//   • Randomized exercise variety (different result on regeneration)
//   • Cross-day volume sanity check
//   • In-memory exercise DB cache (5 min TTL) to cut latency
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateRequest, checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');
const { analyzeClientHistory, formatAnalysisForPrompt, applyMovementScreenExclusions } = require('./utils/client-analysis');
const { exerciseMatchesEquipment, filterUnavailableEquipment } = require('./utils/equipment-filter');
const { buildConditioningFinisher } = require('./utils/finisher');
const { normalizeSupersetRest } = require('./utils/superset-rest');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

// ─── Output-language instruction ──────────────────────────────────────────────
// When the client's app is set to a non-English language, the human-readable
// text (coaching cues, descriptions) should come back in that language so it
// doesn't read half-English. CRITICAL: exercise "name" values must STAY in
// English — they're matched against the English exercise DB to attach the demo
// video, so a translated name would lose the video. JSON keys stay English too.
// Mirrors the same pattern already used in generate-meal-plan-claude.js.
const LANGUAGE_NAMES = { es: 'Spanish (neutral Latin-American)', th: 'Thai' };
const languageInstruction = (lang) => {
  const langName = LANGUAGE_NAMES[lang];
  if (!langName) return ''; // English (or unsupported) → no translation, unchanged behavior
  const voiceRule = lang === 'es'
    ? '\nThe texting-style voice rule still applies, just in Spanish: all lowercase, no em/en dashes, warm and short.'
    : '';
  return `\n\n=== OUTPUT LANGUAGE: ${langName.toUpperCase()} (MANDATORY) ===
Write every "notes" coaching cue in natural ${langName}. Also write "description", "progressionNotes", the "programName", and each workout/day "name" in ${langName}.${voiceRule}
DO NOT translate the JSON field names/keys — keep the JSON structure and its keys exactly in English as specified.
DO NOT translate exercise "name" values — every exercise "name" MUST stay EXACTLY as the English name from the AVAILABLE EXERCISES DATABASE. These names are matched to demonstration videos; a translated name breaks that match and the exercise loses its video.`;
};

// ─── In-memory cache for exercise DB ──────────────────────────────────────────
// Keyed by `coachId || 'global'`. Reset on cold start. 5 min TTL.
const EXERCISE_CACHE_TTL_MS = 5 * 60 * 1000;
const exerciseCache = new Map();

async function loadExercises(supabase, coachId) {
  const cacheKey = coachId || 'global';
  const cached = exerciseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EXERCISE_CACHE_TTL_MS) {
    return cached.exercises;
  }

  let all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles, is_compound, is_unilateral, difficulty, coach_id')
      .range(offset, offset + pageSize - 1);

    // Include the coach's custom exercises alongside global ones
    if (coachId) {
      query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`);
    } else {
      query = query.is('coach_id', null);
    }

    const { data, error } = await query;
    if (error) throw new Error('Unable to load exercise database: ' + error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  exerciseCache.set(cacheKey, { exercises: all, timestamp: Date.now() });
  return all;
}

// ─── Heuristics for warmup/stretch detection ──────────────────────────────────
function isWarmupExercise(name) {
  const lower = (name || '').toLowerCase();
  const kws = [
    'warm up', 'warmup', 'warm-up', 'dynamic stretch', 'activation', 'mobility',
    'light cardio', 'elliptical', 'treadmill', 'rowing machine', 'stationary bike',
    'exercise bike', 'assault airbike', 'air bike', 'recumbent', 'stair climb',
    'spin bike', 'jump rope', 'skipping rope', 'jumping jack', 'high knee',
    'butt kick', 'mountain climber', 'bear crawl', 'inchworm', 'burpee', 'half burpee',
    'arm circle', 'arm swing', 'leg swing', 'hip circle', 'torso twist', 'march',
    'air punches march', 'jogging', 'jog in place', 'running in place', 'box jump',
    'squat jump', 'tuck jump', 'broad jump', 'star jump', 'seal jack', 'jump squat',
    'plyo', 'lateral box jump', 'kneeling squat jump', 'agility ladder',
    'lateral shuffle', 'carioca', 'a skip', 'b skip', 'power skip', 'battle rope',
    'rebounder', 'sprinter lunge', 'downward dog sprint'
  ];
  return kws.some(k => lower.includes(k));
}

function isStretchExercise(name) {
  const lower = (name || '').toLowerCase();
  const kws = [
    'stretch', 'yoga', 'cool down', 'cooldown', 'cool-down', 'flexibility',
    'static hold', 'foam roll', 'foam roller', 'fist against chin', '90 to 90',
    '90/90', 'child pose', 'childs pose', "child's pose", 'pigeon glute',
    'double pigeon', 'downward dog toe to heel', 'cobra stretch', 'cobra side ab',
    'cobra yoga pose', 'spinal twist', 'cat cow', 'cat stretch', 'scorpion',
    'pretzel', 'butterfly yoga', 'crescent moon pose', 'dead hang', 'side lying floor',
    'knee to chest', 'knee hug', 'ceiling look', 'neck tilt', 'neck turn', 'neck rotation',
    'middle back rotation', 'easy pose', 'back slaps wrap', 'cable lat prayer',
    'armless prayer', 'alternating leg downward dog', 'all fours quad'
  ];
  return kws.some(k => lower.includes(k));
}

// ─── Name normalization & similarity scoring (preserved from previous version) ──
function normalizeExerciseName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\boh\b/g, 'overhead')
    .replace(/\balt\b/g, 'alternating')
    .replace(/\binc\b/g, 'incline')
    .replace(/\bdec\b/g, 'decline')
    .replace(/\bext\b/g, 'extension')
    .replace(/\blat\b/g, 'lateral')
    .replace(/\bkb\b/g, 'kettlebell')
    .replace(/\b(male|female|variation|version)\b/g, '')
    .replace(/\b(the|a|an|with|on|for)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyWords(name) {
  const normalized = normalizeExerciseName(name);
  const words = normalized.split(' ');
  const movementWords = ['press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
    'squat', 'lunge', 'deadlift', 'pull', 'push', 'crunch', 'plank', 'dip', 'shrug',
    'crossover', 'kickback', 'pullover', 'twist', 'rotation', 'hold', 'walk', 'step',
    'bicycle', 'russian', 'woodchop', 'rollout', 'climber', 'bug', 'bird', 'dog', 'hip',
    'bridge', 'thrust', 'flutter', 'scissor', 'hollow', 'situp', 'jackknife', 'v-up'];
  const equipmentWords = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band',
    'bodyweight', 'smith', 'ez', 'trap', 'hex'];
  const positionWords = ['incline', 'decline', 'flat', 'seated', 'standing', 'lying',
    'bent', 'reverse', 'close', 'wide', 'single', 'one', 'arm', 'leg'];
  const muscleWords = ['chest', 'back', 'shoulder', 'bicep', 'tricep', 'quad', 'hamstring',
    'glute', 'calf', 'lat', 'pec', 'delt', 'trap', 'ab', 'core'];
  const keyWords = [];
  for (const word of words) {
    if (movementWords.some(m => word.includes(m) || m.includes(word)) ||
        equipmentWords.some(e => word.includes(e) || e.includes(word)) ||
        positionWords.some(p => word === p) ||
        muscleWords.some(m => word.includes(m) || m.includes(word))) {
      keyWords.push(word);
    }
  }
  return keyWords;
}

function calculateSimilarity(aiName, dbName) {
  const normalizedAi = normalizeExerciseName(aiName);
  const normalizedDb = normalizeExerciseName(dbName);
  if (normalizedAi === normalizedDb) return 1;
  if (normalizedDb.includes(normalizedAi)) return 0.95;
  if (normalizedAi.includes(normalizedDb)) return 0.9;
  const aiKeyWords = extractKeyWords(aiName);
  const dbKeyWords = extractKeyWords(dbName);
  if (aiKeyWords.length === 0 || dbKeyWords.length === 0) {
    const aiWords = normalizedAi.split(' ').filter(w => w.length > 2);
    const dbWords = normalizedDb.split(' ').filter(w => w.length > 2);
    let matches = 0;
    for (const word of aiWords) {
      if (dbWords.some(w => w.includes(word) || word.includes(w))) matches++;
    }
    return matches / Math.max(aiWords.length, dbWords.length);
  }
  let matches = 0;
  let partialMatches = 0;
  for (const aiWord of aiKeyWords) {
    for (const dbWord of dbKeyWords) {
      if (aiWord === dbWord) { matches++; break; }
      if (aiWord.includes(dbWord) || dbWord.includes(aiWord)) { partialMatches++; break; }
    }
  }
  return (matches + partialMatches * 0.5) / Math.max(aiKeyWords.length, dbKeyWords.length);
}

function findBestExerciseMatch(aiName, aiMuscleGroup, exercises) {
  const normalizedAiName = (aiName || '').toLowerCase().trim();
  const exact = exercises.find(e => e.name.toLowerCase().trim() === normalizedAiName);
  if (exact) return exact;
  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.5;
  for (const exercise of exercises) {
    let score = calculateSimilarity(aiName, exercise.name);
    if (aiMuscleGroup && exercise.muscle_group) {
      const am = aiMuscleGroup.toLowerCase();
      const dm = exercise.muscle_group.toLowerCase();
      if (am === dm || am.includes(dm) || dm.includes(am)) score += 0.15;
      else if (Array.isArray(exercise.secondary_muscles)) {
        for (const s of exercise.secondary_muscles) {
          if (s.toLowerCase().includes(am) || am.includes(s.toLowerCase())) { score += 0.05; break; }
        }
      }
    }
    if (exercise.video_url || exercise.animation_url) score += 0.05;
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = exercise;
    }
  }
  return bestMatch;
}

function findBestExerciseMatchWithEquipment(aiName, aiMuscleGroup, exercises, selectedEquipment) {
  if (!selectedEquipment || selectedEquipment.length === 0) {
    return findBestExerciseMatch(aiName, aiMuscleGroup, exercises);
  }
  const filtered = exercises.filter(ex => exerciseMatchesEquipment(ex, selectedEquipment));
  // Match ONLY within the equipment-allowed set. Deliberately do NOT fall back
  // to the full library: a near-miss name must never resolve to an exercise the
  // coach's equipment selection excludes (that was how trap-bar / band / pull-up
  // moves leaked into "Bodyweight only" plans). No match → returns null and the
  // exercise is kept unmatched rather than silently swapped for the wrong gear.
  return findBestExerciseMatch(aiName, aiMuscleGroup, filtered);
}

// ─── Structured injury → contraindicated movement patterns ────────────────────
// Maps a structured injury code to substring matchers that exclude exercises
// purely deterministically (independent of the LLM).
const INJURY_EXCLUSIONS = {
  lower_back: [
    'deadlift', 'good morning', 'romanian', 'rdl', 'bent over row', 'barbell row',
    'back squat', 'overhead squat', 'sumo'
  ],
  knee: [
    'jump squat', 'tuck jump', 'box jump', 'broad jump', 'pistol squat',
    'bulgarian split squat', 'deep squat', 'sissy squat', 'lunge jump'
  ],
  shoulder: [
    'overhead press', 'military press', 'snatch', 'jerk', 'behind the neck',
    'upright row', 'arnold press', 'handstand'
  ],
  wrist: [
    'push up', 'pushup', 'push-up', 'handstand', 'planche', 'front squat',
    'clean', 'snatch'
  ],
  hip: [
    'pistol squat', 'cossack squat', 'deep squat', 'jefferson curl'
  ],
  neck: [
    'shrug', 'behind the neck', 'upright row', 'wrestler bridge'
  ],
  elbow: [
    'skull crusher', 'close grip bench', 'tricep extension', 'tate press'
  ],
  ankle: [
    'jump rope', 'box jump', 'broad jump', 'depth jump', 'sprint',
    'lunge jump', 'tuck jump'
  ],
  pregnancy: [
    'crunch', 'sit up', 'situp', 'plank', 'leg raise', 'flutter kick',
    'russian twist', 'jump', 'sprint', 'box jump', 'deadlift', 'twist'
  ]
};

function applyInjuryExclusions(exercises, injuryCodes) {
  if (!injuryCodes || injuryCodes.length === 0) return exercises;
  const banSubstrings = new Set();
  for (const code of injuryCodes) {
    const list = INJURY_EXCLUSIONS[code];
    if (list) list.forEach(s => banSubstrings.add(s));
  }
  if (banSubstrings.size === 0) return exercises;
  return exercises.filter(ex => {
    const n = (ex.name || '').toLowerCase();
    for (const ban of banSubstrings) {
      if (n.includes(ban)) return false;
    }
    return true;
  });
}

// ─── Random sampling helper for exercise variety ──────────────────────────────
function sampleArray(arr, n, seed = Date.now()) {
  if (arr.length <= n) return arr.slice();
  // Fisher-Yates with a basic seeded RNG for variety on regeneration
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

// ─── Client context fetcher ───────────────────────────────────────────────────
// Pulls intake form, recent logs, and injury history into a compact context block.
async function fetchClientContext(supabase, clientId) {
  if (!clientId) return null;
  try {
    const [clientRes, logsRes, lastAssignmentRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, client_name, age, gender, height_ft, height_in, weight, default_goal, fitness_level, health_concerns, equipment_access, exercise_frequency, notes, health_flags, fitness_goal_details, unavailable_equipment, unit_preference')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('workout_logs')
        .select('id, workout_date, duration_minutes, energy_level, workout_rating')
        .eq('client_id', clientId)
        .gte('workout_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('workout_date', { ascending: false })
        .limit(20),
      supabase
        .from('client_workout_assignments')
        .select('name, start_date, end_date, is_active, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    const client = clientRes.data;
    if (!client) return null;

    let exerciseHistoryRaw = [];
    if (logsRes.data && logsRes.data.length > 0) {
      const logIds = logsRes.data.map(l => l.id);
      const { data: exLogs } = await supabase
        .from('exercise_logs')
        .select('exercise_name, max_weight, total_volume, total_sets, total_reps, is_pr')
        .in('workout_log_id', logIds)
        .limit(200);
      if (exLogs) {
        const byName = {};
        for (const ex of exLogs) {
          if (!byName[ex.exercise_name]) byName[ex.exercise_name] = { topWeight: 0, sessions: 0, prs: 0 };
          byName[ex.exercise_name].topWeight = Math.max(byName[ex.exercise_name].topWeight, ex.max_weight || 0);
          byName[ex.exercise_name].sessions++;
          if (ex.is_pr) byName[ex.exercise_name].prs++;
        }
        exerciseHistoryRaw = Object.entries(byName)
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .slice(0, 10);
      }
    }

    return {
      profile: client,
      intake: null, // form_responses lookup deferred
      lastProgram: lastAssignmentRes?.data || null,
      recentSessionCount: logsRes.data?.length || 0,
      // Use workout_rating as a proxy for RPE (no perceived_exertion column exists).
      // Rating is 1-5; ×2 puts it on the 0-10 scale the >=8.5 / <=6 thresholds
      // in formatClientContextForPrompt expect (same convention as the
      // background generator).
      avgRPE: (() => {
        const rated = (logsRes.data || []).filter(l => l.workout_rating);
        return rated.length > 0
          ? (rated.reduce((s, l) => s + l.workout_rating, 0) / rated.length) * 2
          : null;
      })(),
      exerciseHistory: exerciseHistoryRaw.map(([name, data]) => `${name}: top ${data.topWeight}, ${data.sessions} sessions${data.prs ? `, ${data.prs} PRs` : ''}`),
      exerciseHistoryRaw // kept for the summary block
    };
  } catch (err) {
    console.warn('fetchClientContext failed:', err.message);
    return null;
  }
}

function formatClientContextForPrompt(ctx) {
  if (!ctx) return '';
  const lines = ['\n=== CLIENT PROFILE (use this to personalize the program) ==='];
  if (ctx.profile) {
    const p = ctx.profile;
    if (p.client_name) lines.push(`Name: ${p.client_name}`);
    if (p.age) lines.push(`Age: ${p.age}`);
    if (p.gender) lines.push(`Gender: ${p.gender}`);
    if (p.height_ft) lines.push(`Height: ${p.height_ft}'${p.height_in || 0}"`);
    if (p.weight) lines.push(`Weight: ${p.weight} lb`);
    if (p.default_goal) lines.push(`Stated goal: ${p.default_goal}`);
    if (p.fitness_goal_details) {
      lines.push(`Goal details: ${p.fitness_goal_details}`);
      lines.push(`  → SPECIFIC GOALS ARE PROGRAMMING TARGETS, not flavor text. If the goal details name a concrete skill, event, or lift (e.g. unassisted pull-ups, a race/marathon, a strength number), the program MUST train it directly on the days where it fits: a pull-up goal needs an actual pull-up progression (assisted pull ups, negatives, pulldown strength work) as main exercises; a running/endurance event needs real running or conditioning blocks, not just a cardio warm-up. Mentioning the goal in a note without programming for it is a failure.`);
    }
    if (p.fitness_level) lines.push(`Fitness level: ${p.fitness_level}`);
    if (p.health_concerns) lines.push(`Logged injuries / health concerns: ${p.health_concerns}`);
    if (p.equipment_access) lines.push(`Equipment access: ${p.equipment_access}`);
    if (p.exercise_frequency) lines.push(`Exercise frequency: ${p.exercise_frequency}`);
    if (p.notes) lines.push(`Coach notes: ${p.notes}`);
    // Read structured health flags
    const hf = p.health_flags || {};
    if (hf.aiNotes) lines.push(`AI-specific coach notes: ${hf.aiNotes}`);
    if (Array.isArray(hf.injuryCodes) && hf.injuryCodes.length) lines.push(`Structured injuries: ${hf.injuryCodes.join(', ')}`);
    if (Array.isArray(hf.movementFlags) && hf.movementFlags.length) lines.push(`Movement screen flags: ${hf.movementFlags.join(', ')}`);
  }
  if (ctx.lastProgram) {
    lines.push(`\nMost recent program: "${ctx.lastProgram.name}"${ctx.lastProgram.is_active ? ' (currently active)' : ''}, started ${ctx.lastProgram.start_date || ctx.lastProgram.created_at}`);
    lines.push('  → Build progressive overload from this program. Vary exercise selection so the client gets fresh stimulus, but keep the trajectory.');
  }
  if (ctx.exerciseHistory && ctx.exerciseHistory.length > 0) {
    lines.push(`\nRecent training history (last 30 days, top 10):\n  ${ctx.exerciseHistory.join('\n  ')}`);
    lines.push('  → Use these top weights to calibrate exercise selection and difficulty. Do NOT write weight/load numbers in the notes — the client logs and progresses their own weights in the app.');
    lines.push('  → Avoid stale exercises: prefer variations rather than repeating the exact same lifts.');
  }
  if (ctx.recentSessionCount > 0) {
    lines.push(`\nRecent sessions: ${ctx.recentSessionCount} in last 30 days${ctx.avgRPE ? `, average RPE ${ctx.avgRPE.toFixed(1)}` : ''}`);
    if (ctx.avgRPE && ctx.avgRPE >= 8.5) lines.push('  → High average RPE — consider reducing volume slightly or scheduling a deload soon.');
    else if (ctx.avgRPE && ctx.avgRPE <= 6) lines.push('  → Low average RPE — client has room to push intensity.');
  } else {
    lines.push('\nNo recent training logs — client may be returning from a layoff. Start conservatively with ~70% intensity and build up.');
  }
  if (ctx.intake) {
    const intakeStr = typeof ctx.intake === 'string' ? ctx.intake : JSON.stringify(ctx.intake).slice(0, 500);
    lines.push(`\nIntake form excerpt: ${intakeStr}`);
  }
  lines.push('\nUse this context to: (a) calibrate weights/intensity, (b) avoid recently overused exercises for variety, (c) progress from where the client is, (d) respect logged injuries.');
  return lines.join('\n');
}

// ─── Volume sanity check ──────────────────────────────────────────────────────
// Counts weekly working sets per major muscle group across the program.
// Flags muscles that are way under (≤5 sets) or way over (≥25 sets) the
// generally accepted hypertrophy/strength range.
function computeVolumeSummary(programData) {
  const muscleSetCount = {};
  const ranges = {
    chest: [10, 20], back: [10, 20], shoulders: [8, 18], legs: [10, 22],
    glutes: [8, 18], arms: [6, 16], core: [6, 16]
  };
  if (!programData?.weeks?.[0]?.workouts) return null;
  for (const workout of programData.weeks[0].workouts) {
    for (const ex of (workout.exercises || [])) {
      if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown') continue;
      const group = (ex.muscle_group || ex.muscleGroup || 'other').toLowerCase();
      const sets = Number(ex.sets) || 0;
      // Map subgroups to coarse categories
      let key = 'other';
      if (/chest|pec/.test(group)) key = 'chest';
      else if (/back|lat|trap|rhomboid/.test(group)) key = 'back';
      else if (/shoulder|delt/.test(group)) key = 'shoulders';
      else if (/leg|quad|hamstring|calf|calves/.test(group)) key = 'legs';
      else if (/glute/.test(group)) key = 'glutes';
      else if (/bicep|tricep|arm|forearm/.test(group)) key = 'arms';
      else if (/core|ab|oblique/.test(group)) key = 'core';
      muscleSetCount[key] = (muscleSetCount[key] || 0) + sets;
    }
  }
  const warnings = [];
  for (const [muscle, [low, high]] of Object.entries(ranges)) {
    const count = muscleSetCount[muscle] || 0;
    if (count > 0 && count < low) warnings.push(`${muscle}: only ${count} weekly sets (recommended ${low}-${high})`);
    else if (count > high) warnings.push(`${muscle}: ${count} weekly sets is high (recommended ${low}-${high})`);
  }
  return { setsByMuscle: muscleSetCount, warnings };
}

// ─── Multi-week progression generator ─────────────────────────────────────────
// Given a generated week 1, produces week 2..N programmatically using a
// double-progression model (alternate weeks add reps OR add sets/load) plus a
// deload every 4th week.
function generateMultiWeekProgression(week1Workouts, totalWeeks, goal, weightUnit = 'lb') {
  if (totalWeeks <= 1) return [];
  // NOTE: weight/load numbers are intentionally NOT written into notes — the
  // app's built-in weight tracker suggests and logs working weights. Progression
  // notes describe sets/reps/rest/effort intent only.
  const additionalWeeks = [];
  for (let w = 2; w <= totalWeeks; w++) {
    const isDeload = w % 4 === 0; // Deload every 4th week
    const weekIndex = w - 1;

    const workouts = week1Workouts.map(workout => {
      const exercises = (workout.exercises || []).map(ex => {
        if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown' || ex.phase === 'conditioning') {
          // Don't progress warmups/cooldowns/conditioning finishers (no "add
          // weight" note on burpees or an easy jog)
          return { ...ex };
        }
        const baseSets = Number(ex.sets) || 3;
        const baseReps = String(ex.reps || '8-12');

        let newSets = baseSets;
        let newReps = baseReps;
        let progressNote = '';

        if (isDeload) {
          // Deload: -1 set, same reps, back off intensity
          newSets = Math.max(2, baseSets - 1);
          progressNote = `Week ${w} (DELOAD): drop 1 set, ease off the intensity, focus on clean form and recovery`;
        } else if (goal === 'strength') {
          // Strength: progressive overload — the app suggests the actual load
          progressNote = `Week ${w}: progressive overload — aim to beat last week`;
        } else if (goal === 'hypertrophy') {
          // Double progression: add reps until top of range, then add a set
          const range = baseReps.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (range) {
            const lowRep = parseInt(range[1]);
            const highRep = parseInt(range[2]);
            // Bump toward top of rep range each week, add set on weeks 3+
            const repBump = Math.min(highRep, lowRep + (weekIndex - 1));
            newReps = `${repBump}-${highRep}`;
            if (weekIndex >= 3) newSets = baseSets + 1;
            progressNote = `Week ${w}: aim for ${newReps} reps. Once you hit ${highRep} on all sets, progress next week.`;
          } else {
            progressNote = `Week ${w}: aim for 1-2 more reps than last week`;
          }
        } else {
          // fat_loss / general_fitness: increase density by trimming rest
          const baseRest = Number(ex.restSeconds) || 60;
          const newRest = Math.max(20, baseRest - 10 * (weekIndex - 1));
          progressNote = `Week ${w}: shorten rest to ${newRest}s to increase density`;
          return { ...ex, restSeconds: newRest, notes: ex.notes ? `${ex.notes} | ${progressNote}` : progressNote };
        }

        return {
          ...ex,
          sets: newSets,
          reps: newReps,
          notes: ex.notes ? `${ex.notes} | ${progressNote}` : progressNote
        };
      });

      return { ...workout, exercises };
    });

    additionalWeeks.push({ weekNumber: w, workouts, isDeload });
  }
  return additionalWeeks;
}

// ─── Cue voice scrubber ───────────────────────────────────────────────────────
// Client-facing cues must read like the coach texted them: all lowercase, no
// em/en dashes, no AI tells. The prompt asks for this; this enforces it on output.
function humanizeCue(note) {
  if (!note || typeof note !== 'string') return note || '';
  let t = note
    .replace(/[—–]/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
  t = t.replace(/,\s*\./g, '.').replace(/^[,\s]+/, '').trim();
  return t;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'AI service is temporarily unavailable. Please try again later or contact support.',
        errorCode: 'API_KEY_MISSING'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      mode = 'program',
      clientName = 'Client',
      clientId = null,            // NEW: when set, pulls real client context
      coachId = null,             // NEW: scopes custom exercises to this coach
      goal = 'hypertrophy',
      experience = 'intermediate',
      daysPerWeek = 4,
      duration = 4,
      split = 'auto',
      sessionDuration = 60,
      trainingStyle = 'straight_sets',
      exerciseCount = '5-6',
      focusAreas = [],
      equipment = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
      injuries = '',                 // legacy free-text
      injuryCodes = [],              // NEW: structured codes (lower_back, knee, etc.)
      movementScreenFlags = [],      // NEW: structured movement screen issues
      preferences = '',
      targetMuscle = '',
      // NEW programming fields
      tempo = 'standard',            // 'standard' | 'controlled' | 'explosive' | 'tempo_3010' | 'tempo_4020'
      rpeTarget = null,              // 6 | 7 | 8 | 9 | null
      rirTarget = null,              // 0 | 1 | 2 | 3 | null
      unilateralPreference = 'mixed',// 'mixed' | 'prefer_unilateral' | 'bilateral_only'
      conditioningStyle = 'none',    // 'none' | 'hiit' | 'liss' | 'mixed' — for fat-loss/general
      includeProgression = true,     // generate weeks 2..N programmatically
      excludeExerciseNames = [],     // NEW: names to exclude (e.g. recently used)
      varietySeed = Date.now(),      // NEW: deterministic randomization for "regenerate"
      language = 'en'                // NEW: output language for cues/descriptions (en | es)
    } = body;
    // Normalize once; only human-readable text is translated (see languageInstruction).
    const lang = (language || 'en').toString().toLowerCase();

    // Auth is MANDATORY: this endpoint pulls the client's private context
    // (health flags, injuries, intake, training history) into the prompt and
    // burns paid Anthropic tokens — anonymous access was an IDOR (July 2026).
    const { user: authedUser, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    const rateLimit = await checkRateLimitDurable(authedUser.id, 'generate-workout-claude', 30, 10 * 60 * 1000);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

    const isSingleWorkout = mode === 'single';
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ success: false, error: 'Server not configured (missing SUPABASE_SERVICE_KEY)' })
      };
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Ownership: a clientId may only be used by that client or their coach; a
    // coachId may only be the caller's own coach account (or, for a client
    // caller, their own coach — the member modal sends the gym's coachId to
    // include the gym's custom exercises).
    if (clientId) {
      const { data: authClient } = await supabase
        .from('clients')
        .select('id, coach_id, user_id')
        .eq('id', clientId)
        .maybeSingle();
      const isClient = authClient && authClient.user_id === authedUser.id;
      const isCoach = authClient && authClient.coach_id === authedUser.id;
      if (!authClient || (!isClient && !isCoach)) {
        return { statusCode: 403, headers, body: JSON.stringify({ success: false, error: 'Not authorized for this client' }) };
      }
      if (coachId && coachId !== authedUser.id && coachId !== authClient.coach_id) {
        return { statusCode: 403, headers, body: JSON.stringify({ success: false, error: 'Not authorized for this coach' }) };
      }
    } else if (coachId && coachId !== authedUser.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, error: 'Not authorized for this coach' }) };
    }

    // Fetch exercises (cached) — includes coach's custom exercises if coachId given
    const allExercises = await loadExercises(supabase, coachId);
    let exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);

    // Apply structured injury exclusions deterministically
    // If a clientId was passed, pull their stored health_flags and union them
    // with whatever the coach checked in the AI modal — so even if the coach
    // doesn't manually check anything, the client's permanent flags still apply.
    let mergedInjuryCodes = Array.isArray(injuryCodes) ? injuryCodes.slice() : [];
    let mergedMovementFlags = Array.isArray(movementScreenFlags) ? movementScreenFlags.slice() : [];
    if (clientId) {
      try {
        const { data: clientFlags } = await supabase
          .from('clients')
          .select('health_flags, unavailable_equipment')
          .eq('id', clientId)
          .maybeSingle();
        const hf = clientFlags?.health_flags || {};
        if (Array.isArray(hf.injuryCodes)) mergedInjuryCodes = [...new Set([...mergedInjuryCodes, ...hf.injuryCodes])];
        if (Array.isArray(hf.movementFlags)) mergedMovementFlags = [...new Set([...mergedMovementFlags, ...hf.movementFlags])];
        // Drop gear the client's gym doesn't have at the top of the funnel so
        // every downstream pool (candidates, warm-ups, name-matching) inherits
        // it — same guarantee the background generator applies.
        exercisesWithVideos = filterUnavailableEquipment(exercisesWithVideos, clientFlags?.unavailable_equipment);
      } catch (e) { /* ignore */ }
    }

    let exercisesAfterInjuries = applyInjuryExclusions(exercisesWithVideos, mergedInjuryCodes);
    exercisesAfterInjuries = applyMovementScreenExclusions(exercisesAfterInjuries, mergedMovementFlags);

    // Equipment filter — name-aware (the equipment column is unreliable; see
    // utils/equipment-filter.js). This keeps mislabeled gear out of the
    // candidate pool the AI sees, so e.g. "Bodyweight only" never offers
    // barbell / band / suspension-trainer / pull-up moves.
    let equipmentFilteredExercises = exercisesAfterInjuries.filter(ex => exerciseMatchesEquipment(ex, equipment));

    // Apply user-supplied "exclude these recently used" list
    if (excludeExerciseNames.length > 0) {
      const ban = new Set(excludeExerciseNames.map(n => n.toLowerCase().trim()));
      equipmentFilteredExercises = equipmentFilteredExercises.filter(ex => !ban.has(ex.name.toLowerCase().trim()));
    }

    // Group by muscle, then RANDOMLY SAMPLE 50 per group (was 30, deterministic)
    // for better variety on regeneration.
    const exercisesByMuscleGroup = {};
    for (const ex of equipmentFilteredExercises) {
      const group = (ex.muscle_group || 'other').toLowerCase();
      if (!exercisesByMuscleGroup[group]) exercisesByMuscleGroup[group] = [];
      const equipLabel = ex.equipment ? ` [${ex.equipment}]` : '';
      const customLabel = ex.coach_id ? ' (custom)' : '';
      exercisesByMuscleGroup[group].push({ name: `${ex.name}${equipLabel}${customLabel}`, raw: ex });
    }
    // Randomize per muscle group sampling
    const exercisesByMuscleGroupSampled = {};
    let muscleGroupIdx = 0;
    for (const [group, list] of Object.entries(exercisesByMuscleGroup)) {
      // Use varietySeed + group offset so different muscle groups don't all get the same shuffle
      // 20 per group keeps the prompt small enough for Haiku to stay fast.
      // 20 × ~10 muscle groups = ~200 names, still plenty of variety.
      const sampled = sampleArray(list, 20, varietySeed + (muscleGroupIdx++ * 7919));
      exercisesByMuscleGroupSampled[group] = sampled.map(s => s.name);
    }

    if (Object.keys(exercisesByMuscleGroupSampled).length === 0) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({
          success: false,
          error: 'No exercises with videos available for the selected equipment/injury filters. Try selecting more equipment or fewer injury constraints.',
          totalExercises: allExercises.length,
          exercisesWithVideos: exercisesWithVideos.length
        })
      };
    }

    // Pull client context if requested
    const clientContext = await fetchClientContext(supabase, clientId);
    let clientContextBlock = formatClientContextForPrompt(clientContext);

    // Client's weight unit — write all loads in THIS unit (kg for metric clients)
    const weightUnit = clientContext?.profile?.unit_preference === 'metric' ? 'kg' : 'lb';

    // Run the coach-grade analyzer and append its briefing to the prompt
    let clientAnalysis = null;
    if (clientId) {
      try {
        clientAnalysis = await analyzeClientHistory(supabase, clientId, { goal, weightUnit });
        if (clientAnalysis) {
          clientContextBlock = (clientContextBlock || '') + '\n' + formatAnalysisForPrompt(clientAnalysis);
        }
      } catch (e) {
        console.warn('analyzeClientHistory failed:', e.message);
      }
    }

    // Force the client's progressing/PR lifts into the candidate pool so the model
    // can actually keep them. Random per-muscle sampling can drop a lift the client
    // is PRing — and a lift you're progressing on must never be unavailable. (Names
    // already in the exclude list were filtered out of equipmentFilteredExercises
    // upstream, so same-type-day variety is preserved automatically.)
    if (clientAnalysis && Array.isArray(clientAnalysis.exerciseAnalysis)) {
      const keepNames = clientAnalysis.exerciseAnalysis
        .filter(e => e.action === 'progress_load')
        .map(e => e.name);
      for (const keepName of keepNames) {
        const match = equipmentFilteredExercises.find(ex => ex.name.toLowerCase() === String(keepName).toLowerCase());
        if (!match) continue;
        const group = (match.muscle_group || 'other').toLowerCase();
        if (!exercisesByMuscleGroupSampled[group]) exercisesByMuscleGroupSampled[group] = [];
        const equipLabel = match.equipment ? ` [${match.equipment}]` : '';
        const customLabel = match.coach_id ? ' (custom)' : '';
        const display = `${match.name}${equipLabel}${customLabel}`;
        if (!exercisesByMuscleGroupSampled[group].some(s => s.toLowerCase().startsWith(match.name.toLowerCase()))) {
          exercisesByMuscleGroupSampled[group].unshift(display);
        }
      }
    }

    // Goal-driven pool guarantee (same rule as the background generator): the
    // "specific goals are programming targets" directive can't program movements
    // the random sampler never offered. If the goal names pull-ups/chin-ups,
    // force the progressions into the candidate pool.
    const goalDetailsText = String(clientContext?.profile?.fitness_goal_details || '');
    if (/pull[\s-]?ups?|chin[\s-]?ups?/i.test(goalDetailsText)) {
      const progressions = equipmentFilteredExercises
        .filter(ex => /pull[\s-]?up|chin[\s-]?up/i.test(ex.name || ''))
        .slice(0, 4);
      for (const match of progressions) {
        const group = (match.muscle_group || 'other').toLowerCase();
        if (!exercisesByMuscleGroupSampled[group]) exercisesByMuscleGroupSampled[group] = [];
        const display = `${match.name}${match.equipment ? ` [${match.equipment}]` : ''}${match.coach_id ? ' (custom)' : ''}`;
        if (!exercisesByMuscleGroupSampled[group].some(s => s.toLowerCase().startsWith(match.name.toLowerCase()))) {
          exercisesByMuscleGroupSampled[group].unshift(display);
        }
      }
    }

    // Build a sharp, top-of-prompt MANDATE for the lifts the client is actively
    // PRing. A buried "keep what's working" bullet gets overridden by the model's
    // own priors (e.g. "incline barbell is the best chest builder"); a short,
    // explicit, non-negotiable block with the client's real numbers does not.
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

    // Split / style / count instructions
    const splitMap = {
      'push_pull_legs': 'Use a Push/Pull/Legs split (Push: chest, shoulders, triceps; Pull: back, biceps; Legs: quads, hamstrings, glutes, calves)',
      'upper_lower': 'Use an Upper/Lower split (Upper: chest, back, shoulders, arms; Lower: quads, hamstrings, glutes, calves)',
      'full_body': 'Use Full Body workouts (each day hits all major muscle groups)',
      'bro_split': 'Use a Bro Split (each day focuses on one muscle group: Chest, Back, Shoulders, Arms, Legs)',
      'push_pull': 'Use a Push/Pull split (Push: chest, shoulders, triceps, quads; Pull: back, biceps, hamstrings)',
      'auto': 'Choose the most appropriate split based on the number of days and goals'
    };
    const splitInstruction = splitMap[split] || splitMap['auto'];

    const styleMap = {
      'straight_sets': 'Use straight sets. All exercises: "isSuperset": false, "supersetGroup": null.',
      'supersets': 'MANDATORY: Pair MOST main exercises into supersets. Each pair gets the SAME "supersetGroup" letter ("A", "B", ...). Place pairs CONSECUTIVELY. Prefer antagonistic pairings.',
      'circuits': 'Circuit training: group 3-5 exercises into circuits using "isSuperset": true and the same "supersetGroup" letter for all exercises in the circuit.',
      'mixed': 'Mix straight sets with 1-2 superset pairs per workout. Mark superset pairs with "isSuperset": true and matching "supersetGroup" letter.'
    };
    const styleInstruction = styleMap[trainingStyle] || styleMap['straight_sets'];

    const [minEx, maxEx] = exerciseCount.split('-').map(n => parseInt(n));
    const exerciseCountInstruction = `Include ${minEx}-${maxEx} MAIN exercises per workout (warm-up + cool-down are additional)`;

    // Tempo instruction
    const tempoMap = {
      'standard': 'Use a controlled tempo (1-2 sec eccentric, 1 sec concentric). Mention tempo in notes for compound lifts.',
      'controlled': 'CONTROLLED TEMPO — note "3 sec eccentric, 1 sec pause, 1 sec concentric" in notes for main lifts. This emphasizes time under tension.',
      'explosive': 'EXPLOSIVE TEMPO on concentric — "Lower for 2 sec, drive up explosively". For power development.',
      'tempo_3010': 'TEMPO 3-0-1-0 — note "3 sec down, no pause, 1 sec up, no pause" on main lifts.',
      'tempo_4020': 'TEMPO 4-0-2-0 — note "4 sec down, no pause, 2 sec up, no pause" on main lifts. High time under tension.'
    };
    const tempoInstruction = tempoMap[tempo] || tempoMap['standard'];

    // RPE/RIR instruction
    let intensityInstruction = '';
    if (rpeTarget) intensityInstruction = `Target RPE ${rpeTarget}/10 on working sets. Add "RPE ${rpeTarget}" to notes on main lifts.`;
    else if (rirTarget !== null && rirTarget !== undefined) intensityInstruction = `Target ${rirTarget} RIR (reps in reserve) on working sets. Add "${rirTarget} RIR" to notes on main lifts.`;

    // Unilateral preference
    let unilateralInstruction = '';
    if (unilateralPreference === 'prefer_unilateral') {
      unilateralInstruction = 'STRONGLY prefer unilateral (single-arm/single-leg) exercises where they exist — these correct imbalances and improve stability. Aim for 30-50% unilateral movements per workout.';
    } else if (unilateralPreference === 'bilateral_only') {
      unilateralInstruction = 'Use ONLY bilateral exercises (both sides working simultaneously). Avoid single-arm and single-leg movements.';
    }

    // Conditioning finisher — fires whenever the coach picked one (not gated on
    // goal). Names REAL library moves (exact DB names, with videos) from the
    // injury+equipment-filtered pool so the finisher actually renders with a
    // video, and explicitly overrides the "cardio only in warm-up" rule so the
    // prompt stops contradicting itself. See utils/finisher.js.
    const conditioningInstruction = buildConditioningFinisher({
      conditioningStyle,
      pool: equipmentFilteredExercises,
      equipment
    });

    // Focus areas
    let focusInstruction = '';
    if (focusAreas.length > 0) {
      focusInstruction = `IMPORTANT: This workout MUST focus primarily on ${focusAreas.join(' and ')}. At least 70% of main exercises should directly target ${focusAreas.join(' or ')}.`;
    }

    // Build available exercises list
    const exercisesList = Object.entries(exercisesByMuscleGroupSampled)
      .map(([group, list]) => `${group.toUpperCase()}: ${list.join(', ')}`)
      .join('\n');

    // Build warmup/stretch references from full unfiltered DB so we always have these
    const allExerciseNames = exercisesWithVideos.map(e => e.name);
    const warmupAll = allExerciseNames
      .filter(n => /jump|jack|burpee|mountain climber|high knee|butt kick|arm circle|leg swing|hip circle|torso twist|march|skip|jog|run in place/i.test(n));
    // Rotate the offered list each generation so the model isn't anchored to the
    // same first few names (it was defaulting to "Jogging" on every workout).
    const warmupRotateStart = warmupAll.length > 0 ? Math.floor(Math.random() * warmupAll.length) : 0;
    const warmupSuitable = warmupAll.length <= 6
      ? warmupAll
      : warmupAll.slice(warmupRotateStart).concat(warmupAll.slice(0, warmupRotateStart)).slice(0, 6);
    const stretchExercises = allExerciseNames.filter(n => /stretch/i.test(n)).slice(0, 15);

    let warmupStretchInstructions = '';
    if (warmupSuitable.length > 0 || stretchExercises.length > 0) {
      warmupStretchInstructions = '\n\n=== WARMUP AND STRETCH EXERCISES ===';
      if (warmupSuitable.length > 0) {
        warmupStretchInstructions += `\n\nAVAILABLE WARM-UPS (copy name EXACTLY):\n${warmupSuitable.map(n => `"${n}"`).join(', ')}`;
        warmupStretchInstructions += '\n\nInclude 2-3 warm-up exercises at the START. Mark with "isWarmup": true. Use 1-2 sets, 10-15 reps, 0-30 seconds rest.';
        warmupStretchInstructions += '\n\nWARM-UP SELECTION (IMPORTANT — do NOT default to the same warm-up every time):';
        warmupStretchInstructions += '\n- Pick warm-ups that prepare THE MUSCLES TRAINED THAT DAY. Upper-body days → arm circles, arm swings, torso twists, band/shoulder prep. Lower-body / leg days → leg swings, hip circles, bodyweight squats, marches, high knees. Full-body days → mix.';
        warmupStretchInstructions += '\n- Do NOT use "Jogging" / "Jog in place" / "Running in place" as the warm-up on every workout. General running-in-place is fine occasionally for leg or full-body days, but it is a poor warm-up for an upper-body day and must NOT be the automatic first pick.';
        warmupStretchInstructions += '\n- VARY the warm-up across days in a program — a 4-day program should not open all 4 days with the same cardio move.';
      }
      // Day-aware cardio warm-up machine (same rule as the background
      // generator): rower on pull/back days, step mill on leg days,
      // elliptical everywhere else — never default to jogging/treadmill.
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
        warmupStretchInstructions += `\n\nCARDIO WARM-UP CHOICE (MANDATORY): if this workout opens with a cardio warm-up, use "${preferredCardio}" (copy the name EXACTLY), easy pace, reps in TIME format ("3 min"). Do NOT use jogging or the treadmill as the warm-up.`;
      }
      if (stretchExercises.length > 0) {
        warmupStretchInstructions += `\n\nAVAILABLE STRETCHES (copy name EXACTLY):\n${stretchExercises.map(n => `"${n}"`).join(', ')}`;
        warmupStretchInstructions += '\n\nInclude 2-3 stretches at the END targeting the SAME muscles trained. Mark with "isStretch": true. Use 1 set, "30s hold" reps, 0 rest.';
      }
    }

    const availableExercisesPrompt = `
CRITICAL - AVAILABLE EXERCISES DATABASE:
You MUST ONLY use exercises from this list (each has a demonstration video).
Custom exercises (marked "(custom)") are this coach's own additions — they are PREFERRED when they fit, since they reflect this coach's signature style.
Using exercises not in this list will result in missing video demonstrations.

${exercisesList}

If a category lacks options, select similar exercises from related categories.
`;

    // Muscle map for single workouts
    const muscleGroupMap = {
      'chest': 'chest (pecs, upper chest, lower chest)',
      'back': 'back (lats, rhomboids, traps, rear delts)',
      'shoulders': 'shoulders (front delts, side delts, rear delts)',
      'arms': 'arms (biceps, triceps, forearms)',
      'legs': 'legs (quads, hamstrings, calves)',
      'glutes': 'glutes and hamstrings',
      'core': 'core (abs, obliques, lower back)',
      'upper_body': 'upper body (chest, back, shoulders, arms — all four)',
      'lower_body': 'lower body (quads, hamstrings, glutes, calves)',
      'full_body': 'full body (all major muscle groups)',
      'push': 'push (chest, shoulders, triceps)',
      'pull': 'pull (back, biceps)'
    };

    // Strong, separate constraint block for split-aware days. The general
    // "focus" instruction allows 30% off-target, which Haiku/Sonnet abuse to
    // sneak biceps onto push days. This block is 100% strict.
    let strictSplitConstraint = '';
    if (targetMuscle === 'push') {
      strictSplitConstraint = `

=== STRICT PUSH-DAY RULE (100% — NEVER VIOLATE) ===
This is a PUSH workout. EVERY single main exercise must directly train chest, shoulders, OR triceps.
ABSOLUTELY FORBIDDEN — do not include ANY of these on a push day:
- Any back exercise: rows of any kind, pulldowns, pull-ups, chin-ups, face pulls, shrugs, deadlifts, pullovers
- Any biceps exercise: bicep curls of any kind (barbell, dumbbell, hammer, preacher, spider, concentration, cable, incline)
- Any leg exercise
If you include even ONE row, curl, or pulldown, the workout is WRONG. There is no "but it works secondaries" exception. 100% push only.`;
    } else if (targetMuscle === 'pull') {
      strictSplitConstraint = `

=== STRICT PULL-DAY RULE (100% — NEVER VIOLATE) ===
This is a PULL workout. EVERY single main exercise must directly train back, rear delts, OR biceps.
ABSOLUTELY FORBIDDEN — do not include ANY of these on a pull day:
- Any chest exercise: bench press, incline press, decline press, dumbbell press, fly, dip, push-up, hammer strength chest press
- Any triceps exercise: tricep extension, pushdown, kickback, skull crusher, close-grip press, overhead extension
- Any front-delt-pressing exercise: overhead press, military press, shoulder press, Arnold press, push press
- Any leg exercise
If you include even ONE press, fly, or tricep movement, the workout is WRONG. 100% pull only.`;
    }

    // HYROX race-prep block — only when the member picks the Hyrox goal. Hyrox is
    // a fixed-format functional-fitness race: 8 x 1km runs alternated with 8
    // stations (SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, 1000m Row,
    // Farmers Carry, Sandbag Lunges, Wall Balls). We prep it with running/erg
    // intervals plus the functional station movements, naming ONLY real library
    // moves so everything renders with a video. See generateWorkoutModal 'hyrox'.
    let hyroxBlock = '';
    if (goal === 'hyrox') {
      hyroxBlock = `

=== HYROX RACE PREP (MANDATORY — for THIS workout this OVERRIDES the "cardio machines belong only in the warm-up" rule) ===
This session trains the client for HYROX: a functional-fitness race of 8 x 1km runs alternated with 8 stations — SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, 1000m Row, Farmers Carry, Sandbag Lunges, and Wall Balls. Build a FULL-BODY strength-endurance + conditioning workout that prepares them for that exact demand:
- Choose MAIN moves that mirror the race stations, using ONLY exact names from the AVAILABLE EXERCISES list — e.g. a SkiErg pull ("Ski Ergometer ..."), a rower ("Gym Rowing Machine ..."), a sled move ("Sled Drag And Row"), a loaded carry ("Dumbbell Farmer Walks"), a loaded lunge ("Plate Overhead Walking Lunge"), "Kettlebell Swing", "Box Jump", a burpee variation, or "Assault Airbike ...". If a station has no library match, pick the closest functional move that IS in the list.
- Program them as CIRCUITS / rounds done back-to-back with short rest (20-40s), reps mostly 12-20 or in TIME format ("45s"), so the session builds work capacity under fatigue — not one-rep strength.
- COMPROMISED RUNNING is the whole point: include at least one running / erg conditioning block ("phase": "conditioning") that pairs a run/row/ski/airbike bout with functional work, reps in TIME or distance format (e.g. "1 km", "4 min", "500 m").
- Do NOT program heavy low-rep max-strength work or bodybuilding isolation (bicep curls, flyes, leg extensions, calf raises) — every exercise must carry over to the race.`;
    }

    const repRangeBlock = goal === 'strength'
      ? `- Main compounds: 4-5 sets of 3-6 reps, 2-3 min rest\n- Accessories: 3-4 sets of 6-8 reps, 90-120s rest`
      : goal === 'hypertrophy'
        ? `- Main compounds: 4 sets of 6-10 reps, 90-120s rest\n- Isolation: 3 sets of 10-15 reps, 60-90s rest\n- Finishers: 2-3 sets of 12-20 reps, 45-60s rest`
        : goal === 'hyrox'
          ? `- Functional station moves: 3-5 rounds of 12-20 reps (or 40-60s work), short 20-40s rest, done as circuits/back-to-back\n- Running / erg / airbike intervals: TIME or distance format (e.g. "4 min", "500 m"), kept as a conditioning block\n- Keep loads moderate — this is strength-endurance and work capacity under fatigue, NEVER 1-5 rep max strength`
          : `- All exercises: 2-3 sets of 15-20 reps, 30-45s rest`;

    // Session duration → time-budget + scaled phases (short sessions trim warm-up/
    // cool-down and exercise count so the workout actually fits the minutes).
    //
    // Counts calibrated (July 2026) against the app's own duration estimator
    // (utils/workout-estimates.js, mirrored in src/utils/workoutDuration.js) so
    // the estimate the member SEES lands near the minutes they PICKED. With
    // hypertrophy defaults each straight-set main runs ~5-9 min incl. rest, so:
    // 30 min → 3-4 mains, 45 → 4-5, 60 → 5-6, 90 → 7-9 with fuller sets/rests.
    // The old rules overshot 30 min by ~10-15 min and gave 90 min the exact
    // same workout as 60.
    const sdSingle = parseInt(sessionDuration) || 60;
    let dWarm, dMain, dCool, dBudget;
    if (sdSingle <= 22) {
      dBudget = `=== TIME BUDGET: ~${sdSingle} MIN TOTAL (SHORT SESSION) ===\nThe ENTIRE workout (warm-up + work + cool-down + ALL rest between sets) must fit in about ${sdSingle} minutes. Keep it tight and efficient.`;
      dWarm = `PHASE 1 — QUICK WARM-UP (1-2 min): just 1 short dynamic/cardio movement. Mark "isWarmup": true, "phase": "warmup".`;
      dMain = `PHASE 2 — MAIN WORKOUT: only 3-4 main exercises, shorter rest (30-45s), supersets encouraged to save time. ${styleInstruction}. ${focusInstruction}`;
      dCool = `PHASE 3 — COOL-DOWN: 1 quick stretch only (or omit). Mark "isStretch": true, "phase": "cooldown".`;
    } else if (sdSingle <= 35) {
      dBudget = `=== TIME BUDGET: ~${sdSingle} MIN TOTAL ===\nKeep the whole workout to about ${sdSingle} minutes INCLUDING all rest between sets — do not program a 45-minute session.`;
      dWarm = `PHASE 1 — WARM-UP (3-4 min): 1 short cardio (2-3 min, reps in TIME format like "3 min") + 1 dynamic prep. Mark "isWarmup": true, "phase": "warmup".`;
      dMain = `PHASE 2 — MAIN WORKOUT: 3-4 main exercises. Keep rest tight so it fits: 60-90s after the heaviest compound, 45-60s after everything else. ${styleInstruction}. ${focusInstruction}`;
      dCool = `PHASE 3 — COOL-DOWN (2-3 min): 1-2 static stretches. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".`;
    } else if (sdSingle <= 50) {
      dBudget = `=== TIME BUDGET: ~${sdSingle} MIN TOTAL ===\nAim for about ${sdSingle} minutes total INCLUDING all rest between sets.`;
      dWarm = `PHASE 1 — WARM-UP (5 min): 1 cardio (5 min) + 1 dynamic prep. Mark "isWarmup": true, "phase": "warmup". Cardio reps in TIME format ("5 min").`;
      dMain = `PHASE 2 — MAIN WORKOUT: 4-5 main exercises (a 6th only if supersetting saves the time). ${styleInstruction}. ${focusInstruction}`;
      dCool = `PHASE 3 — COOL-DOWN (5 min): 2 static stretches. Mark "isStretch": true, "phase": "cooldown". Reps "30s hold".`;
    } else if (sdSingle <= 70) {
      dBudget = `=== TIME BUDGET: ~${sdSingle} MIN TOTAL ===\nA full workout of about ${sdSingle} minutes.`;
      dWarm = `PHASE 1 — WARM-UP (5-8 min): 1 cardio (5 min) + 1-2 dynamic prep targeting that day's muscles. Mark "isWarmup": true, "phase": "warmup". For cardio reps use TIME format ("5 min").`;
      dMain = `PHASE 2 — MAIN WORKOUT: ${exerciseCountInstruction}. ${styleInstruction}. ${focusInstruction}`;
      dCool = `PHASE 3 — COOL-DOWN (5-7 min): 2-3 static stretches matching the day's muscles. Mark "isStretch": true, "phase": "cooldown". Reps must be "30s hold".`;
    } else {
      // 90-minute pick: must NOT get the same content as 60 — scale volume up.
      // max() keeps a coach's explicitly larger exerciseCount (6-8 / 8-10) intact.
      const longMin = Math.max(minEx || 5, 7);
      const longMax = Math.max(maxEx || 6, 9);
      dBudget = `=== TIME BUDGET: ~${sdSingle} MIN TOTAL (LONG SESSION) ===\nThis is a LONG session of about ${sdSingle} minutes. A standard 60-minute workout is TOO SHORT for it — program enough exercises, sets, and full rest periods to genuinely fill about ${sdSingle} minutes.`;
      dWarm = `PHASE 1 — WARM-UP (8-10 min): 1 cardio (5 min) + 2 dynamic preps targeting that day's muscles. Mark "isWarmup": true, "phase": "warmup". For cardio reps use TIME format ("5 min").`;
      dMain = `PHASE 2 — MAIN WORKOUT: ${longMin}-${longMax} main exercises. Use 4 sets on most main lifts and take the FULL rest window for the goal (this long session is not rushed). ${styleInstruction}. ${focusInstruction}`;
      dCool = `PHASE 3 — COOL-DOWN (5-7 min): 3 static stretches matching the day's muscles. Mark "isStretch": true, "phase": "cooldown". Reps must be "30s hold".`;
    }
    const singlePhasesBlock = `${dBudget}\n\n=== MANDATORY WORKOUT PHASES ===\n${dWarm}\n${dMain}\n${dCool}${conditioningInstruction}`;

    const baseSystem = (modeBlock) => `You are an elite strength & conditioning coach with 20+ years of experience. Return ONLY valid JSON.

${modeBlock}
${strictSplitConstraint}
${hyroxBlock}
${keepMandate}
=== WEIGHTS / LOADS (MANDATORY) ===
NEVER write specific weights or loads (e.g. "45 lb", "20 kg", "use 70%", "you hit 50 lb last time") in any "notes" field. The app has a built-in weight tracker that suggests and logs the client's working weights — duplicating numbers in notes conflicts with it. Notes are for form cues, tempo, RPE/RIR and rep targets only.
${availableExercisesPrompt}
${clientContextBlock}

${singlePhasesBlock}

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
- Rep targets must be standard gym numbers (3, 5, 6, 8, 10, 12, 15, 20) or a range like "8-12" / "15-20". NEVER an oddball single number like 7, 9, 11, 13, 14, 16, 17, 18 or 19.

=== EXERCISE SELECTION ===
- Use EXACT names from the AVAILABLE EXERCISES DATABASE (custom exercises are PREFERRED if they fit).
- NEVER invent or modify names.
- CROSS-DAY VARIETY: Never reuse the same exercise on two days that train the same muscles. If there are two push days (or two pull/leg days), the primary lift AND the accessories must DIFFER — e.g. barbell bench press on one push day, dumbbell or incline press on the other. Rotate equipment (barbell ↔ dumbbell ↔ cable ↔ machine) and angle across same-type days to spread the stimulus and reduce joint wear. Two same-type days should look clearly different, not like copies. (Any exercise missing from your AVAILABLE list was already used on another day — pick something else.)
- DO NOT auto-default to textbook lifts (barbell bench press, back squat, conventional deadlift) just because they are "standard". A good coach chooses the primary from the client's history, equipment, and variety — not reflex. Only feature barbell bench if it genuinely fits this client best.
- KEEP WHAT'S WORKING: If a CLIENT BRIEFING exercise is tagged "KEEP+PROGRESS" (the client is still PRing / adding reps) and it appears in your AVAILABLE EXERCISES list, you MUST include that exact exercise as a primary. Never replace a lift the client is progressing on with a generic substitute.
- Add brief, actionable form cues in "notes" for each main exercise. Don't repeat the exercise name in notes. The "notes" field is shown to the CLIENT — write a normal coaching cue only. NEVER put internal labels (KEEP+PROGRESS, SWAP, PERSIST, ROTATE, REGRESSED, briefing text, or emoji) in notes, and NEVER put weights/loads in notes (e.g. "you hit 50 lb last time", "start around 45 lb") — the app tracks weights for the client.
- VOICE — write each cue like the coach texted it on his phone, NOT like AI: ALL LOWERCASE (every letter, including the start of each sentence, no capitals ever); NO em dashes or en dashes (use commas/periods); short, warm, contractions are good; no AI filler ("engage your core", "ensure proper form", "maintain", "throughout the movement", "optimal", "focus on").
- MAKE EVERY NOTE DIFFERENT. Do not reuse one formula ("control the eccentric, squeeze at the top, no swinging") with the nouns swapped, coaches hate that. For each exercise pick a DIFFERENT angle: setup/positioning, breathing/bracing, tempo, the one common mistake on THAT lift, what muscle it should feel like, range of motion, or effort target. Don't start consecutive notes with the same word, and make each cue specific enough that it couldn't be pasted onto a different exercise. Use phrases like "control the eccentric", "squeeze at the top", "no swinging", "full range of motion" at most ONCE in the whole workout.
- PERSONAL TOUCH — make it feel made for them: the client profile above has real detail (their training history, lifts they're progressing on, injuries, how often they train). on the MAIN exercises where you actually know something about this client, work it into the cue so they feel seen (e.g. "this has been a staple for you, keep building it", "you've been moving well here, chase one more than last time", "keeping these controlled so that shoulder stays happy"). aim for about 2-3 genuinely personal cues per workout, skip warm-ups/stretches, and vary how you do it. never invent a detail that isn't in the profile, and never put numbers in a cue.
- CARDIO MACHINES (treadmill, stairmaster, bike, rower, elliptical, jump rope) are CARDIO ONLY. They belong in WARM-UP (with "phase": "warmup", reps in time format like "5 min") or in a CONDITIONING FINISHER. They are NEVER main strength exercises with sets/reps like "3×12-15". If the CLIENT PROFILE's goal details name a running or endurance event (marathon, race, 5k/10k), a real running/conditioning block at the END of the day ("phase": "conditioning", 15-20 min, TIME format) is REQUIRED on the days where it fits — that goal must actually be trained.
- A "Push" day means ONLY chest, shoulders, triceps. A "Pull" day means ONLY back and biceps. NEVER mix them — putting a row on a push day or a chest press on a pull day is a programming error.
- For LEG days: include at least one squat pattern, one hip hinge (RDL/deadlift/hip thrust), one hamstring isolation, one calf exercise, and ideally one glute-specific movement.

CONSTRAINTS:
- Equipment available: ${equipment.join(', ')}. Do NOT include exercises requiring other equipment.
${mergedInjuryCodes && mergedInjuryCodes.length ? `- Structured injury exclusions ALREADY APPLIED: ${mergedInjuryCodes.join(', ')}. Continue to avoid movements that would aggravate these.` : ''}
${mergedMovementFlags && mergedMovementFlags.length ? `- Structured movement-screen exclusions ALREADY APPLIED: ${mergedMovementFlags.join(', ')}. Avoid contraindicated patterns.` : ''}
${injuries ? `\n=== INJURY / LIMITATION RESTRICTIONS (ABSOLUTE — HIGHEST PRIORITY, NEVER VIOLATE) ===\nClient has: ${injuries}\n- This is the #1 rule and OVERRIDES every other instruction in this prompt — the split, the focus, the exercise order, everything.\n- DO NOT include ANY exercise that loads, stresses, or could aggravate the affected area, even indirectly. When you are not 100% sure a movement is safe for this person, LEAVE IT OUT and choose a clearly safe alternative.\n- It is always better to return a slightly less "optimal" workout than one that risks hurting them. Safety wins over everything, no matter what.\n` : ''}
${preferences ? `\n=== CLIENT REQUESTS (ABSOLUTE — HONOR EVERY ITEM, NO EXCEPTIONS) ===\nClient said: ${preferences}\n- Treat every request as a hard rule, not a suggestion. Honor ALL of it, no matter what.\n- If they ask to AVOID something (an exercise, a movement, a machine, a body part), that thing must NOT appear anywhere — no variations, no "close enough" substitutes, not even in the warm-up or finisher.\n- If they ask to INCLUDE something, it MUST appear, as long as it exists in the AVAILABLE EXERCISES list and does not conflict with a stated injury.\n- The only thing that can override a request is a stated injury — if the two ever conflict, keep them safe and skip the request.\n` : ''}
For supersets: BOTH paired exercises get "isSuperset": true and matching "supersetGroup". SUPERSET REST: the exercises in a superset are done back-to-back, so every move EXCEPT the last one in the group gets a SHORT "restSeconds" of 10-30 (just enough to switch stations). ONLY the LAST exercise of the superset group gets the full recovery rest (60-90s+) before the next round.
${warmupStretchInstructions}`;

    let systemPrompt;
    let userMessage;

    if (isSingleWorkout) {
      const muscleLabel = muscleGroupMap[targetMuscle] || targetMuscle;
      const modeBlock = `Create a single ${muscleLabel} workout for an ${experience}-level trainee optimized for ${goal}.`;
      systemPrompt = baseSystem(modeBlock) + `

Return this exact JSON structure:
{
  "programName": "${(targetMuscle || 'workout').charAt(0).toUpperCase() + (targetMuscle || 'workout').slice(1)} Workout",
  "description": "Brief description",
  "goal": "${goal}",
  "difficulty": "${experience}",
  "daysPerWeek": 1,
  "weeks": [{
    "weekNumber": 1,
    "workouts": [{
      "dayNumber": 1,
      "name": "${(targetMuscle || 'workout').charAt(0).toUpperCase() + (targetMuscle || 'workout').slice(1)} Day",
      "targetMuscles": ${JSON.stringify(targetMuscle === 'upper_body' ? ['chest', 'back', 'shoulders', 'arms'] : targetMuscle === 'lower_body' ? ['quads', 'hamstrings', 'glutes', 'calves'] : targetMuscle === 'full_body' ? ['chest', 'back', 'legs', 'shoulders'] : [targetMuscle])},
      "exercises": [
        {"name": "Dynamic Warm-up (pick one that preps today's muscles)", "muscleGroup": "warmup", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Main Exercise", "muscleGroup": "${targetMuscle}", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "drive through your heels and keep your chest tall", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
      ]
    }]
  }],
  "progressionNotes": "How to progress week over week"
}`;
      userMessage = `Create a single ${muscleLabel} workout for ${clientName}. Goal: ${goal}. Experience: ${experience}. Include ${exerciseCount} MAIN exercises plus warm-up and cool-down.${injuries ? ` Client injuries: "${injuries}".` : ''}${preferences ? ` Preferences: "${preferences}".` : ''} Return ONLY valid JSON, no markdown.`;
    } else {
      const modeBlock = `Create a ${daysPerWeek}-day ${goal} program for an ${experience}-level trainee. ${splitInstruction}`;
      systemPrompt = baseSystem(modeBlock) + `

Return this exact JSON structure:
{
  "programName": "Program Name",
  "description": "Brief description",
  "goal": "${goal}",
  "difficulty": "${experience}",
  "daysPerWeek": ${daysPerWeek},
  "weeks": [{
    "weekNumber": 1,
    "workouts": [{
      "dayNumber": 1,
      "name": "Day Name",
      "targetMuscles": ["muscle1"],
      "exercises": [
        {"name": "Dynamic Warm-up (pick one that preps today's muscles)", "muscleGroup": "warmup", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Main Exercise", "muscleGroup": "primary", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "drive through your heels and keep your chest tall", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
      ]
    }]
  }],
  "progressionNotes": "How to progress week over week"
}`;
      userMessage = `Create a complete ${daysPerWeek}-day workout program for ${clientName}. Goal: ${goal}. Experience: ${experience}.${injuries ? ` Injuries: "${injuries}".` : ''}${preferences ? ` Preferences: "${preferences}".` : ''} Return ONLY valid JSON, no markdown.`;
    }

    // Append the output-language instruction (both single + program modes share
    // this systemPrompt). No-op for English, so existing behavior is unchanged.
    systemPrompt += languageInstruction(lang);

    // Haiku 4.5 — the only Anthropic model fast enough to fit per-day generation
    // inside Netlify's 26s function timeout when paired with the strict push/pull
    // constraint block. Sonnet 4.5 produces nicer programs but timed out for
    // the user repeatedly. Split-violation detector + auto-fix below catches any
    // mistakes Haiku makes. For coach-quality output, use the refine chat (which
    // does run on Sonnet) or a future background-function path.
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt
    });

    const responseText = message.content[0]?.text || '';

    let programData;
    try {
      programData = JSON.parse(responseText.trim());
    } catch (e) {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) programData = JSON.parse(jsonMatch[1].trim());
      else {
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) programData = JSON.parse(objectMatch[0]);
        else throw new Error('Could not extract JSON from response');
      }
    }

    if (!programData.weeks || !Array.isArray(programData.weeks)) {
      throw new Error('AI returned an unexpected format. Please try again.');
    }

    // Sanitize numeric fields
    for (const week of programData.weeks) {
      for (const workout of (week.workouts || [])) {
        if (!Array.isArray(workout.exercises)) workout.exercises = [];
        workout.exercises = workout.exercises.filter(ex => {
          if (!ex.name || typeof ex.name !== 'string') return false;
          if (typeof ex.sets !== 'number' || ex.sets < 1) ex.sets = 3;
          if (!ex.reps) ex.reps = '8-12';
          // Snap oddball single-number rep targets (e.g. "17") to standard gym
          // numbers — the model occasionally invents mid-range values that look
          // wrong on the set chips. Ranges ("8-12") and time strings ("5 min",
          // "30s hold") pass through untouched; low strength reps (1-6) too.
          const plainReps = typeof ex.reps === 'number'
            ? ex.reps
            : (/^\s*\d+\s*$/.test(String(ex.reps)) ? parseInt(ex.reps, 10) : null);
          if (plainReps != null && plainReps > 6) {
            const standards = [8, 10, 12, 15, 20, 25, 30];
            const snapped = standards.reduce((best, s) =>
              Math.abs(s - plainReps) < Math.abs(best - plainReps) ? s : best, standards[0]);
            ex.reps = String(snapped);
          }
          if (typeof ex.restSeconds !== 'number') ex.restSeconds = 60;
          // Strip "(custom)" / "[equipment]" labels the AI may have copied from our prompt
          ex.name = ex.name.replace(/\s*\(custom\)\s*$/i, '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
          return true;
        });
      }
    }

    // Match AI-generated exercises to DB (and apply equipment validation)
    let matchStats = { total: 0, matched: 0, unmatched: 0, unmatchedNames: [] };

    for (const week of programData.weeks) {
      for (const workout of (week.workouts || [])) {
        workout.exercises = (workout.exercises || []).map(aiEx => {
          matchStats.total++;
          const detectedWarmup = isWarmupExercise(aiEx.name);
          const detectedStretch = isStretchExercise(aiEx.name);
          const isWarmupOrStretch = aiEx.isWarmup || aiEx.isStretch || detectedWarmup || detectedStretch;
          const exercisesToMatch = isWarmupOrStretch ? exercisesWithVideos : exercisesAfterInjuries;
          const match = isWarmupOrStretch
            ? findBestExerciseMatch(aiEx.name, aiEx.muscleGroup, exercisesToMatch)
            : findBestExerciseMatchWithEquipment(aiEx.name, aiEx.muscleGroup, exercisesToMatch, equipment);

          const baseFields = {
            sets: aiEx.isWarmup ? (aiEx.sets || 1) : aiEx.isStretch ? (aiEx.sets || 1) : (aiEx.sets || 3),
            reps: aiEx.isWarmup ? (aiEx.reps || '10-15') : aiEx.isStretch ? (aiEx.reps || '30s hold') : (aiEx.reps || '8-12'),
            restSeconds: aiEx.isWarmup ? (aiEx.restSeconds != null ? aiEx.restSeconds : 30) : aiEx.isStretch ? (aiEx.restSeconds != null ? aiEx.restSeconds : 0) : (aiEx.restSeconds || 90),
            notes: humanizeCue(aiEx.notes),
            isWarmup: aiEx.isWarmup || false,
            isStretch: aiEx.isStretch || false,
            isSuperset: aiEx.isSuperset || false,
            supersetGroup: aiEx.supersetGroup || null,
            phase: aiEx.phase || (aiEx.isWarmup ? 'warmup' : aiEx.isStretch ? 'cooldown' : 'main')
          };

          if (match) {
            matchStats.matched++;
            return {
              id: match.id,
              name: match.name,
              video_url: match.video_url,
              animation_url: match.animation_url,
              thumbnail_url: match.thumbnail_url || null,
              muscle_group: match.muscle_group,
              equipment: match.equipment,
              instructions: match.instructions,
              isCustom: !!match.coach_id,
              ...baseFields,
              matched: true
            };
          } else {
            matchStats.unmatched++;
            if (!isWarmupOrStretch) matchStats.unmatchedNames.push(aiEx.name);
            return {
              name: aiEx.name,
              muscle_group: aiEx.muscleGroup,
              equipment: null,
              ...baseFields,
              matched: false
            };
          }
        });
      }
    }

    // Multi-week progression — generate weeks 2..N
    if (!isSingleWorkout && includeProgression && duration > 1 && programData.weeks.length === 1) {
      const week1Workouts = programData.weeks[0].workouts || [];
      const additionalWeeks = generateMultiWeekProgression(week1Workouts, duration, goal, weightUnit);
      programData.weeks = programData.weeks.concat(additionalWeeks);
    }

    // Split-violation detector + auto-fix. For push/pull single-mode generations,
    // any exercise that doesn't belong on this day's split is REMOVED from the
    // returned program. We still report removals in splitViolations so the
    // frontend can show a banner and the coach can refine if too many got cut.
    const splitViolations = [];
    if (isSingleWorkout && (targetMuscle === 'push' || targetMuscle === 'pull')) {
      const violationCheck = (ex) => {
        // A conditioning finisher is deliberately off the muscle split (cardio /
        // bodyweight intervals) — never strip it as a "wrong movement".
        if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown' || ex.phase === 'conditioning') return null;
        const name = (ex.name || '').toLowerCase();
        const mg = (ex.muscle_group || ex.muscleGroup || '').toLowerCase();
        if (targetMuscle === 'push') {
          if (/\b(curl|row|pulldown|pull-down|pull down|pullup|pull-up|pull up|chinup|chin-up|chin up|face pull|shrug|deadlift|pullover|pull over)\b/.test(name)) return 'pull movement on push day';
          if (/\b(back|biceps?|lats?|rhomboid|trap)\b/.test(mg) && !/(rear delt|trap.*shoulder)/i.test(mg)) return `${mg} on push day`;
        } else if (targetMuscle === 'pull') {
          if (/\b(bench press|chest press|incline press|decline press|fly|flye|dip|push-up|pushup|push up|tricep|skull crusher|pushdown|push-down|push down|kickback|overhead press|military press|shoulder press|arnold press|push press)\b/.test(name)) return 'push movement on pull day';
          if (/\b(chest|pec|tricep|triceps)\b/.test(mg)) return `${mg} on pull day`;
        }
        return null;
      };
      for (const week of programData.weeks) {
        for (const workout of (week.workouts || [])) {
          const kept = [];
          for (const ex of (workout.exercises || [])) {
            const v = violationCheck(ex);
            if (v) {
              splitViolations.push({ day: workout.name || `Day ${workout.dayNumber}`, exercise: ex.name, reason: v, autoRemoved: true });
              // Auto-fix: drop the violating exercise from the workout
              continue;
            }
            kept.push(ex);
          }
          workout.exercises = kept;
        }
      }
    }

    // Superset rest fix: only the LAST move of a superset carries the full
    // recovery rest — the earlier moves flow straight into the next, so they
    // get a short transition rest (10-30s) instead of the AI's default 90s.
    normalizeSupersetRest(programData.weeks);

    // Volume sanity check (after auto-fix so it reflects the actual program)
    const volumeSummary = computeVolumeSummary(programData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: programData,
        matchStats: {
          total: matchStats.total,
          matched: matchStats.matched,
          unmatched: matchStats.unmatched,
          unmatchedNames: matchStats.unmatchedNames,
          databaseExercises: allExercises.length,
          customExerciseCount: allExercises.filter(e => e.coach_id).length,
          exercisesWithVideos: exercisesWithVideos.length
        },
        volumeSummary,
        splitViolations,
        clientContextUsed: !!clientContext,
        clientContextSummary: clientContext ? {
          clientName: clientContext.profile?.client_name,
          sessionCount: clientContext.recentSessionCount,
          avgRPE: clientContext.avgRPE ? clientContext.avgRPE.toFixed(1) : null,
          topExercises: (clientContext.exerciseHistoryRaw || []).slice(0, 5).map(([name, data]) => ({ name, topWeight: data.topWeight, sessions: data.sessions })),
          lastProgramName: clientContext.lastProgram?.name || null,
          hasIntake: !!clientContext.intake,
          hasCoachNotes: !!clientContext.profile?.notes
        } : null,
        clientAnalysis,
        cachedExerciseDb: true,
        generatedWeeks: programData.weeks.length
      })
    };

  } catch (error) {
    console.error('Workout generation error:', error.message);
    console.error('Stack:', error.stack);

    let userMessage = 'Failed to generate workout. Please try again.';
    let errorCode = 'GENERATION_ERROR';

    if (error.message?.includes('exercise database') || error.message?.includes('Unable to load')) {
      userMessage = error.message;
      errorCode = 'DATABASE_ERROR';
    } else if (error.message?.includes('Could not extract JSON') || error.message?.includes('unexpected format')) {
      userMessage = 'AI returned an unexpected response. Please try again — this usually works on retry.';
      errorCode = 'PARSE_ERROR';
    } else if (error.status === 429 || error.message?.includes('rate limit')) {
      userMessage = 'AI service is busy. Please wait a moment and try again.';
      errorCode = 'RATE_LIMITED';
    } else if (error.status === 529 || error.message?.includes('overloaded')) {
      userMessage = 'AI service is temporarily overloaded. Please try again in a few minutes.';
      errorCode = 'OVERLOADED';
    } else if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
      userMessage = 'Request timed out. Try reducing the number of workout days or exercises.';
      errorCode = 'TIMEOUT';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: userMessage, errorCode })
    };
  }
};
