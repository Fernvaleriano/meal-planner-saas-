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
const { corsHeaders, handleCors, authenticateRequest } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json'
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
  const filtered = exercises.filter(ex => {
    const eq = (ex.equipment || '').toLowerCase();
    if (!eq || eq === 'none' || eq === 'bodyweight' || eq === 'body weight') {
      return selectedEquipment.some(e => e.toLowerCase() === 'bodyweight');
    }
    return selectedEquipment.some(e => eq.includes(e.toLowerCase()));
  });
  const match = findBestExerciseMatch(aiName, aiMuscleGroup, filtered);
  if (match) return match;
  return findBestExerciseMatch(aiName, aiMuscleGroup, exercises);
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
    const [clientRes, logsRes, intakeRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, client_name, age, gender, height_cm, weight_kg, goal, fitness_level, injuries, equipment_access, training_days_per_week, notes')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('workout_logs')
        .select('id, workout_date, duration_minutes, perceived_exertion')
        .eq('client_id', clientId)
        .gte('workout_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('workout_date', { ascending: false })
        .limit(20),
      supabase
        .from('client_intake_responses')
        .select('responses, submitted_at')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    const client = clientRes.data;
    if (!client) return null;

    let exerciseHistory = [];
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
        exerciseHistory = Object.entries(byName)
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .slice(0, 10)
          .map(([name, data]) => `${name}: top ${data.topWeight}, ${data.sessions} sessions${data.prs ? `, ${data.prs} PRs` : ''}`);
      }
    }

    return {
      profile: client,
      intake: intakeRes?.data?.responses || null,
      recentSessionCount: logsRes.data?.length || 0,
      avgRPE: logsRes.data?.length > 0
        ? (logsRes.data.reduce((s, l) => s + (l.perceived_exertion || 0), 0) / logsRes.data.filter(l => l.perceived_exertion).length || null)
        : null,
      exerciseHistory
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
    if (p.height_cm) lines.push(`Height: ${p.height_cm} cm`);
    if (p.weight_kg) lines.push(`Weight: ${p.weight_kg} kg`);
    if (p.goal) lines.push(`Stated goal: ${p.goal}`);
    if (p.fitness_level) lines.push(`Fitness level: ${p.fitness_level}`);
    if (p.injuries) lines.push(`Logged injuries: ${p.injuries}`);
    if (p.equipment_access) lines.push(`Equipment access: ${p.equipment_access}`);
    if (p.training_days_per_week) lines.push(`Available days: ${p.training_days_per_week}/week`);
    if (p.notes) lines.push(`Coach notes: ${p.notes}`);
  }
  if (ctx.exerciseHistory && ctx.exerciseHistory.length > 0) {
    lines.push(`\nRecent training history (last 30 days, top 10):\n  ${ctx.exerciseHistory.join('\n  ')}`);
  }
  if (ctx.recentSessionCount > 0) {
    lines.push(`\nRecent sessions: ${ctx.recentSessionCount} in last 30 days${ctx.avgRPE ? `, average RPE ${ctx.avgRPE.toFixed(1)}` : ''}`);
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
function generateMultiWeekProgression(week1Workouts, totalWeeks, goal) {
  if (totalWeeks <= 1) return [];
  const additionalWeeks = [];
  for (let w = 2; w <= totalWeeks; w++) {
    const isDeload = w % 4 === 0; // Deload every 4th week
    const weekIndex = w - 1;

    const workouts = week1Workouts.map(workout => {
      const exercises = (workout.exercises || []).map(ex => {
        if (ex.isWarmup || ex.isStretch || ex.phase === 'warmup' || ex.phase === 'cooldown') {
          // Don't progress warmups/cooldowns
          return { ...ex };
        }
        const baseSets = Number(ex.sets) || 3;
        const baseReps = String(ex.reps || '8-12');

        let newSets = baseSets;
        let newReps = baseReps;
        let progressNote = '';

        if (isDeload) {
          // Deload: -1 set, same reps, lighter load
          newSets = Math.max(2, baseSets - 1);
          progressNote = `Week ${w} (DELOAD): drop 1 set, use ~70% of recent working weight, focus on form`;
        } else if (goal === 'strength') {
          // Strength: add load (suggested via notes), keep reps low
          progressNote = `Week ${w}: add 2.5-5 lb to working weight; if all reps hit at top of range, increase 5-10 lb next week`;
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
            progressNote = `Week ${w}: aim for ${newReps} reps. Once you hit ${highRep} on all sets, add 5 lb next week.`;
          } else {
            progressNote = `Week ${w}: aim for 1-2 more reps than last week, or +2.5-5 lb if reps held`;
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
      varietySeed = Date.now()       // NEW: deterministic randomization for "regenerate"
    } = body;

    // Authenticate (optional — we accept unauthed for back-compat, but log it)
    let authedUser = null;
    try {
      const auth = await authenticateRequest(event);
      authedUser = auth.user;
    } catch (e) { /* keep going */ }

    const isSingleWorkout = mode === 'single';
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ success: false, error: 'Server not configured (missing SUPABASE_SERVICE_KEY)' })
      };
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch exercises (cached) — includes coach's custom exercises if coachId given
    const allExercises = await loadExercises(supabase, coachId);
    let exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);

    // Apply structured injury exclusions deterministically
    const exercisesAfterInjuries = applyInjuryExclusions(exercisesWithVideos, injuryCodes);

    // Equipment filter
    const matchesSelectedEquipment = (ex) => {
      const exEquipment = (ex.equipment || '').toLowerCase();
      if (!equipment || equipment.length === 0) return true;
      return equipment.some(eq => {
        const eqLower = eq.toLowerCase();
        if (eqLower === 'bodyweight') {
          return !exEquipment || exEquipment === 'none' || exEquipment === 'bodyweight' || exEquipment === 'body weight';
        }
        if (eqLower === 'bands') return exEquipment.includes('band');
        if (eqLower === 'pullup_bar') return exEquipment.includes('pull-up') || exEquipment.includes('pullup') || exEquipment.includes('pull up');
        return exEquipment.includes(eqLower);
      });
    };
    let equipmentFilteredExercises = exercisesAfterInjuries.filter(matchesSelectedEquipment);

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
      // 30 per group keeps the prompt small enough for Haiku to stay fast
      const sampled = sampleArray(list, 30, varietySeed + (muscleGroupIdx++ * 7919));
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
    const clientContextBlock = formatClientContextForPrompt(clientContext);

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

    // Conditioning instruction (for fat_loss / general_fitness)
    let conditioningInstruction = '';
    if (conditioningStyle === 'hiit' && (goal === 'fat_loss' || goal === 'general_fitness')) {
      conditioningInstruction = '\n=== CONDITIONING FINISHER (last 8-10 min) ===\nAdd a HIIT finisher: 4-8 rounds, 30s work / 30s rest, using bodyweight or kettlebell movements (burpees, mountain climbers, kettlebell swings, jump rope). Mark with "phase": "conditioning".';
    } else if (conditioningStyle === 'liss' && (goal === 'fat_loss' || goal === 'general_fitness')) {
      conditioningInstruction = '\n=== CONDITIONING FINISHER ===\nAdd 10-15 minutes of LISS cardio (steady-state, RPE 5-6) at the end. Treadmill walk, easy bike, or rowing. Mark with "phase": "conditioning".';
    } else if (conditioningStyle === 'mixed' && (goal === 'fat_loss' || goal === 'general_fitness')) {
      conditioningInstruction = '\n=== CONDITIONING FINISHER ===\nAlternate days: HIIT finisher one day, LISS cardio (10-15 min) the next. Mark with "phase": "conditioning".';
    }

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
    const warmupSuitable = [
      ...allExerciseNames.filter(n => /jump|jack|burpee|mountain climber|high knee|butt kick|arm circle|leg swing|hip circle|torso twist|march|skip|jog|run in place/i.test(n)).slice(0, 12)
    ];
    const stretchExercises = allExerciseNames.filter(n => /stretch/i.test(n)).slice(0, 30);

    let warmupStretchInstructions = '';
    if (warmupSuitable.length > 0 || stretchExercises.length > 0) {
      warmupStretchInstructions = '\n\n=== WARMUP AND STRETCH EXERCISES ===';
      if (warmupSuitable.length > 0) {
        warmupStretchInstructions += `\n\nAVAILABLE WARM-UPS (copy name EXACTLY):\n${warmupSuitable.map(n => `"${n}"`).join(', ')}`;
        warmupStretchInstructions += '\n\nInclude 2-3 warm-up exercises at the START. Mark with "isWarmup": true. Use 1-2 sets, 10-15 reps, 0-30 seconds rest.';
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
      'chest': 'chest ONLY (pecs, upper chest, lower chest) — NO back, NO biceps, NO leg work',
      'back': 'back ONLY (lats, rhomboids, traps, rear delts) — NO chest, NO triceps, NO leg work',
      'shoulders': 'shoulders ONLY (front delts, side delts, rear delts) — NO chest pressing focus, NO back rowing focus',
      'arms': 'arms ONLY (biceps, triceps, forearms) — NO chest, back, leg, or shoulder work',
      'legs': 'legs (quads, hamstrings, calves) — NO upper body work',
      'glutes': 'glutes and hamstrings — NO upper body work',
      'core': 'core ONLY (abs, obliques, lower back) — NO compound lifts',
      'upper_body': 'upper body (chest, back, shoulders, arms — all four)',
      'lower_body': 'lower body (quads, hamstrings, glutes, calves)',
      'full_body': 'full body (all major muscle groups)',
      // PUSH/PULL split-aware targets — these are CRITICAL for proper PPL programming
      'push': 'PUSH MUSCLES ONLY: chest (pecs), shoulders (especially front + side delts), and triceps. ABSOLUTELY NO back, NO biceps, NO rows, NO pulldowns, NO curls, NO leg work. Every main exercise must be a horizontal press, vertical press, fly, or tricep movement.',
      'pull': 'PULL MUSCLES ONLY: back (lats, mid-back, rear delts, traps) and biceps. ABSOLUTELY NO chest, NO triceps, NO front/side delt presses, NO leg work. Every main exercise must be a row, pulldown, pull-up, face pull, shrug, or biceps curl.'
    };

    const repRangeBlock = goal === 'strength'
      ? `- Main compounds: 4-5 sets of 3-6 reps, 2-3 min rest\n- Accessories: 3-4 sets of 6-8 reps, 90-120s rest`
      : goal === 'hypertrophy'
        ? `- Main compounds: 4 sets of 6-10 reps, 90-120s rest\n- Isolation: 3 sets of 10-15 reps, 60-90s rest\n- Finishers: 2-3 sets of 12-20 reps, 45-60s rest`
        : `- All exercises: 2-3 sets of 15-20 reps, 30-45s rest`;

    const baseSystem = (modeBlock) => `You are an elite strength & conditioning coach with 20+ years of experience. Return ONLY valid JSON.

${modeBlock}
${availableExercisesPrompt}
${clientContextBlock}

=== MANDATORY WORKOUT PHASES ===
PHASE 1 — WARM-UP (5-8 min): 1 cardio (3-5 min) + 1-2 dynamic prep targeting that day's muscles. Mark "isWarmup": true, "phase": "warmup". For cardio reps use TIME format ("3 min", "5 min").
PHASE 2 — MAIN WORKOUT: ${exerciseCountInstruction}. ${styleInstruction}. ${focusInstruction}
PHASE 3 — COOL-DOWN (5-7 min): 2-3 static stretches matching the day's muscles. Mark "isStretch": true, "phase": "cooldown". Reps must be "30s hold".
${conditioningInstruction}

=== INTENSITY & TEMPO ===
${tempoInstruction}
${intensityInstruction}
${unilateralInstruction}

=== REP RANGES (goal: ${goal}) ===
${repRangeBlock}

=== EXERCISE SELECTION ===
- Use EXACT names from the AVAILABLE EXERCISES DATABASE (custom exercises are PREFERRED if they fit).
- NEVER invent or modify names.
- Don't repeat the same exercise across days unless it's a key compound.
- Add brief, actionable form cues in "notes" for each main exercise. Don't repeat the exercise name in notes.
- CARDIO MACHINES (treadmill, stairmaster, bike, rower, elliptical, jump rope) are CARDIO ONLY. They belong in WARM-UP (with "phase": "warmup", reps in time format like "5 min") or in a CONDITIONING FINISHER. They are NEVER main strength exercises with sets/reps like "3×12-15".
- A "Push" day means ONLY chest, shoulders, triceps. A "Pull" day means ONLY back and biceps. NEVER mix them — putting a row on a push day or a chest press on a pull day is a programming error.
- For LEG days: include at least one squat pattern, one hip hinge (RDL/deadlift/hip thrust), one hamstring isolation, one calf exercise, and ideally one glute-specific movement.

CONSTRAINTS:
- Equipment available: ${equipment.join(', ')}. Do NOT include exercises requiring other equipment.
${injuryCodes && injuryCodes.length ? `- Structured injury exclusions ALREADY APPLIED: ${injuryCodes.join(', ')}. Continue to avoid movements that would aggravate these.` : ''}
${injuries ? `\n=== INJURY/LIMITATION RESTRICTIONS (MANDATORY — NEVER VIOLATE) ===\nClient has: ${injuries}\n- DO NOT include any exercise that could aggravate these.\n- This overrides ALL other selection guidance — substitute a safe alternative.\n` : ''}
${preferences ? `\n=== CLIENT PREFERENCES (MANDATORY) ===\nClient says: ${preferences}\n- Strictly follow these.\n` : ''}
For supersets: BOTH paired exercises get "isSuperset": true and matching "supersetGroup".
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
        {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Main Exercise", "muscleGroup": "${targetMuscle}", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
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
        {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Main Exercise", "muscleGroup": "primary", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
      ]
    }]
  }],
  "progressionNotes": "How to progress week over week"
}`;
      userMessage = `Create a complete ${daysPerWeek}-day workout program for ${clientName}. Goal: ${goal}. Experience: ${experience}.${injuries ? ` Injuries: "${injuries}".` : ''}${preferences ? ` Preferences: "${preferences}".` : ''} Return ONLY valid JSON, no markdown.`;
    }

    // Claude Haiku 4.5 — fast enough to stay safely under Netlify's 26s
    // function timeout for per-day generation. Refinement (refine-workout-claude.js)
    // still uses Sonnet for higher-quality interpretation.
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
            notes: aiEx.notes || '',
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
      const additionalWeeks = generateMultiWeekProgression(week1Workouts, duration, goal);
      programData.weeks = programData.weeks.concat(additionalWeeks);
    }

    // Volume sanity check
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
        clientContextUsed: !!clientContext,
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
