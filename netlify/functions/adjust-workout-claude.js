// Netlify Function — client-facing "Adjust my workout" AI.
//
// This is the RESTRICTED, plan-anchored cousin of generate-workout-claude.js.
// It does NOT build a fresh program or let a client design their own training.
// It takes the client's OWN coach-assigned workouts (the days they missed, or the
// session they're about to do away from their usual gym) and produces ONE session
// that keeps them on track:
//
//   • behind      — blend the missed planned days into a single realistic catch-up
//                   session (priority to the main compound work, trims overlap).
//   • travel      — adapt the planned session to limited equipment (hotel gym /
//                   minimal / bodyweight), swapping only what the gear forces.
//   • short_time  — condense the planned session into the minutes they have today.
//
// In every case the reference is the client's existing plan + goal. The output is
// a SINGLE workout in the same shape generate-workout-claude returns for
// mode:'single', so the client app saves it through the exact same ad-hoc path.
//
// Auth is mandatory (paid Anthropic call + private client context): the caller
// must be the client themselves or their coach (authenticateClientAccess).

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateClientAccess } = require('./utils/auth');
const { exerciseMatchesEquipment, filterUnavailableEquipment } = require('./utils/equipment-filter');
const { normalizeSupersetRest } = require('./utils/superset-rest');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

// ─── Output-language instruction (mirrors generate-workout-claude.js) ─────────
// Human-readable text (cues, names) comes back in the app's language, but
// exercise "name" values MUST stay English so they match the exercise DB video.
const LANGUAGE_NAMES = { es: 'Spanish (neutral Latin-American)', th: 'Thai' };
const languageInstruction = (lang) => {
  const langName = LANGUAGE_NAMES[lang];
  if (!langName) return '';
  const voiceRule = lang === 'es'
    ? '\nThe texting-style voice rule still applies, just in Spanish: all lowercase, no em/en dashes, warm and short.'
    : '';
  return `\n\n=== OUTPUT LANGUAGE: ${langName.toUpperCase()} (MANDATORY) ===
Write every "notes" coaching cue and the workout "name" in natural ${langName}.${voiceRule}
DO NOT translate the JSON field names/keys — keep them exactly in English.
DO NOT translate exercise "name" values — every exercise "name" MUST stay EXACTLY as the English name from the AVAILABLE EXERCISES list. These names are matched to demonstration videos; a translated name breaks that match.`;
};

// ─── Exercise DB load (globals + coach customs), cached per coach ─────────────
const EXERCISE_CACHE_TTL_MS = 5 * 60 * 1000;
const exerciseCache = new Map();
async function loadExercises(supabase, coachId) {
  const cacheKey = coachId || 'global';
  const cached = exerciseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EXERCISE_CACHE_TTL_MS) return cached.exercises;
  let all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles, coach_id')
      .range(offset, offset + pageSize - 1);
    if (coachId) query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`);
    else query = query.is('coach_id', null);
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

// ─── Name matching (compact — same approach as refine-workout-claude.js) ──────
function normalizeExerciseName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function findBestMatch(aiName, exercises) {
  const target = normalizeExerciseName(aiName);
  if (!target) return null;
  const exact = exercises.find(e => normalizeExerciseName(e.name) === target);
  if (exact) return exact;
  return exercises.find(e => {
    const n = normalizeExerciseName(e.name);
    return n.includes(target) || target.includes(n);
  }) || null;
}

// ─── Warmup / stretch detection (light heuristic for phase tagging) ───────────
function looksWarmup(name) {
  const n = (name || '').toLowerCase();
  return /warm[\s-]?up|jumping jack|high knee|arm circle|leg swing|mobility|dynamic|jog|treadmill|bike|row machine|skip/.test(n);
}
function looksStretch(name) {
  const n = (name || '').toLowerCase();
  return /stretch|cool[\s-]?down|foam roll|yoga|child.?s pose|cobra|pigeon|hold/.test(n);
}

// ─── Structured injury exclusions (mirror of generate-workout-claude.js) ──────
const INJURY_EXCLUSIONS = {
  lower_back: ['deadlift', 'good morning', 'romanian', 'rdl', 'bent over row', 'barbell row', 'back squat', 'overhead squat', 'sumo'],
  knee: ['jump squat', 'tuck jump', 'box jump', 'broad jump', 'pistol squat', 'bulgarian split squat', 'deep squat', 'sissy squat', 'lunge jump'],
  shoulder: ['overhead press', 'military press', 'snatch', 'jerk', 'behind the neck', 'upright row', 'arnold press', 'handstand'],
  wrist: ['push up', 'pushup', 'push-up', 'handstand', 'planche', 'front squat', 'clean', 'snatch'],
  hip: ['pistol squat', 'cossack squat', 'deep squat', 'jefferson curl'],
  neck: ['shrug', 'behind the neck', 'upright row', 'wrestler bridge'],
  elbow: ['skull crusher', 'close grip bench', 'tricep extension', 'tate press'],
  ankle: ['jump rope', 'box jump', 'broad jump', 'depth jump', 'sprint', 'lunge jump', 'tuck jump'],
  pregnancy: ['crunch', 'sit up', 'situp', 'plank', 'leg raise', 'flutter kick', 'russian twist', 'jump', 'sprint', 'box jump', 'deadlift', 'twist'],
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

// ─── Travel equipment presets → equipment tokens for exerciseMatchesEquipment ──
const EQUIPMENT_PRESETS = {
  full: null, // no extra filter — their normal gym
  hotel_gym: ['dumbbell', 'cable', 'machine', 'bodyweight'],
  minimal: ['dumbbell', 'bands', 'bodyweight'],
  bodyweight: ['bodyweight'],
};
const EQUIPMENT_LABELS = {
  hotel_gym: 'a hotel gym (dumbbells, a few machines/cables, no heavy barbell setup)',
  minimal: 'minimal equipment (a pair of dumbbells and/or resistance bands)',
  bodyweight: 'bodyweight only (no equipment at all)',
};

// ─── Cue voice scrubber (mirror of generate-workout-claude.js) ────────────────
function humanizeCue(note) {
  if (!note || typeof note !== 'string') return note || '';
  return note
    .replace(/[—–]/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/,\s*\./g, '.')
    .replace(/^[,\s]+/, '')
    .trim();
}

// Build a compact "the plan" text block from the reference workouts.
function formatReferenceWorkouts(referenceWorkouts) {
  return referenceWorkouts.map((w, i) => {
    const title = w.name || `Session ${i + 1}`;
    const lines = (w.exercises || [])
      .filter(e => e && e.name && !e.isWarmup && !e.isStretch && e.phase !== 'warmup' && e.phase !== 'cooldown')
      .map(e => {
        const sets = e.sets != null ? `${e.sets}` : '3';
        const reps = e.reps != null ? `${e.reps}` : '8-12';
        const mg = e.muscleGroup || e.muscle_group || '';
        return `  - ${e.name}${mg ? ` (${mg})` : ''}: ${sets} x ${reps}`;
      });
    return `${title}:\n${lines.join('\n') || '  (no exercises listed)'}`;
  }).join('\n\n');
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ success: false, error: 'AI service is temporarily unavailable. Please try again later.' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Server not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      clientId,
      situation = 'behind',            // 'behind' | 'travel' | 'short_time'
      referenceWorkouts = [],          // [{ name, exercises: [{ name, sets, reps, muscleGroup, notes }] }]
      goal = '',                       // client's stated goal (from their plan/profile)
      equipmentContext = 'full',       // travel only: 'full' | 'hotel_gym' | 'minimal' | 'bodyweight'
      timeMinutes = null,              // short_time only
      injuryCodes = [],
      language = 'en',
    } = body;

    const lang = (language || 'en').toString().toLowerCase();

    if (!clientId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'clientId is required' }) };
    }
    if (!Array.isArray(referenceWorkouts) || referenceWorkouts.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'No plan to adjust. This tool needs your assigned workouts as a reference.' }) };
    }
    const validSituations = ['behind', 'travel', 'short_time'];
    const sit = validSituations.includes(situation) ? situation : 'behind';

    // Auth: caller must be the client or their coach.
    const { user: authedUser, error: authError } = await authenticateClientAccess(event, clientId);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Pull the client's coach (scopes custom exercises), stored injuries, unavailable gear, goal.
    const { data: client } = await supabase
      .from('clients')
      .select('coach_id, default_goal, fitness_goal_details, health_flags, unavailable_equipment')
      .eq('id', clientId)
      .maybeSingle();
    const coachId = client?.coach_id || null;
    const resolvedGoal = goal || client?.default_goal || 'general fitness';

    // Merge structured injuries: request + the client's permanent stored flags.
    let mergedInjuryCodes = Array.isArray(injuryCodes) ? injuryCodes.slice() : [];
    const hf = client?.health_flags || {};
    if (Array.isArray(hf.injuryCodes)) mergedInjuryCodes = [...new Set([...mergedInjuryCodes, ...hf.injuryCodes])];

    // Candidate pool for any swaps the AI has to make.
    let exercises = await loadExercises(supabase, coachId);
    let pool = exercises.filter(e => e.video_url || e.animation_url);
    pool = applyInjuryExclusions(pool, mergedInjuryCodes);
    pool = filterUnavailableEquipment(pool, client?.unavailable_equipment);

    // Travel: constrain the swap pool to what they actually have with them.
    const equipmentTokens = sit === 'travel' ? EQUIPMENT_PRESETS[equipmentContext] : null;
    if (equipmentTokens) {
      pool = pool.filter(ex => exerciseMatchesEquipment(ex, equipmentTokens));
    }

    // Group + cap the candidate pool for the prompt (25 per muscle keeps it small).
    const byGroup = {};
    for (const ex of pool) {
      const g = (ex.muscle_group || 'other').toLowerCase();
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(`${ex.name}${ex.coach_id ? ' (custom)' : ''}`);
    }
    const availableList = Object.entries(byGroup)
      .map(([g, list]) => `${g.toUpperCase()}: ${list.slice(0, 25).join(', ')}`)
      .join('\n');

    if (!availableList) {
      return { statusCode: 422, headers, body: JSON.stringify({ success: false, error: 'No suitable exercises for that equipment. Try a different option.' }) };
    }

    // Target session length.
    const durationTarget = sit === 'short_time' && Number(timeMinutes) > 0
      ? Math.max(15, Math.min(90, Number(timeMinutes)))
      : 50;

    // Situation-specific mission text.
    let mission;
    if (sit === 'behind') {
      mission = `The client fell behind and MISSED the planned session(s) listed below. Build ONE realistic catch-up session (~${durationTarget} minutes) that gets them back on track. Prioritise the main compound lifts from the missed day(s); where two missed days overlap on a muscle, keep the most important movement and trim the redundant accessory work. Do NOT try to cram every single exercise in — a good catch-up hits the priorities and is still finishable.`;
    } else if (sit === 'travel') {
      const gearLabel = EQUIPMENT_LABELS[equipmentContext] || 'limited equipment';
      mission = `The client is training away from their usual gym with ${gearLabel}. Adapt the planned session below to that equipment: keep any listed exercise they CAN still do, and for any move that needs gear they don't have, swap it for the closest equivalent from AVAILABLE EXERCISES that trains the same muscle. Keep the training effect as close to the original plan as possible. Aim for ~${durationTarget} minutes.`;
    } else {
      mission = `The client only has ${durationTarget} minutes today. Condense the planned session below into a focused ${durationTarget}-minute version: keep the main lifts, cut or shorten the least essential accessory work, and tighten rest where sensible. Same muscles, less filler.`;
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are the client's own strength coach making a SMALL, TEMPORARY adjustment to the plan you already gave them. You are NOT designing a new program and NOT letting the client freestyle their training.

${mission}

HARD RULES:
- Output exactly ONE workout (a single session). Never multiple days, never a multi-week plan.
- Stay ANCHORED to the plan below. Reuse the client's planned exercises by their EXACT names wherever possible — they already have demo videos. Only introduce a different exercise when the situation forces it (e.g. equipment they don't have), and then pick it from AVAILABLE EXERCISES.
- Keep it aligned with the client's goal: ${resolvedGoal}.
- Start with 1-2 quick warm-up moves (mark "isWarmup": true, "phase": "warmup") and you MAY end with 1-2 cool-down stretches (mark "isStretch": true, "phase": "cooldown"). Everything else is the main work.
- Do NOT write weight/load numbers in notes — the client logs their own weights in the app.
- Coaching cues ("notes") read like a quick text from the coach: all lowercase, warm, short, no em/en dashes.

Return ONLY valid JSON in EXACTLY this shape, nothing else:
{
  "name": "short session name",
  "exercises": [
    { "name": "Exact Exercise Name", "muscleGroup": "chest", "sets": 3, "reps": "8-12", "restSeconds": 60, "notes": "quick cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main" }
  ]
}
- "reps" is a string (e.g. "8-12" or "30 sec"). "sets" is a number. Do not add fields not shown above.
- SUPERSET REST: if two exercises share a "supersetGroup" letter they are done back-to-back — every move except the LAST in the group gets a short restSeconds (10-30); only the last gets full rest.

AVAILABLE EXERCISES (use these exact names for any swap; custom = the coach's own filmed moves, prefer them):
${availableList}${languageInstruction(lang)}`;

    const userMessage = `CLIENT GOAL: ${resolvedGoal}

THE CLIENT'S PLANNED SESSION(S) TO ADJUST:
${formatReferenceWorkouts(referenceWorkouts)}

Build the single adjusted session now. Return ONLY the JSON.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });

    const responseText = message.content[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(responseText.trim());
    } catch (e) {
      const codeBlock = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlock) parsed = JSON.parse(codeBlock[1].trim());
      else {
        const objMatch = responseText.match(/\{[\s\S]*\}/);
        if (objMatch) parsed = JSON.parse(objMatch[0]);
        else throw new Error('Could not parse the adjusted workout');
      }
    }

    if (!parsed || !Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
      throw new Error('The adjusted workout came back empty. Please try again.');
    }

    // Re-match every exercise to the DB so it carries a real id + video/thumbnail.
    // Prefer the coach-scoped pool (globals + customs); an unmatched move is dropped
    // on the client (no id → no video), same contract as the gym generator.
    const matchPool = exercises.filter(e => e.video_url || e.animation_url);
    let matched = 0;
    const matchedExercises = parsed.exercises.map(ex => {
      const cleanName = (ex.name || '').replace(/\s*\(custom\)\s*$/i, '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
      const hit = findBestMatch(cleanName, matchPool);
      const isWarm = ex.isWarmup || ex.phase === 'warmup' || looksWarmup(cleanName);
      const isStretch = ex.isStretch || ex.phase === 'cooldown' || looksStretch(cleanName);
      const base = {
        ...ex,
        name: hit ? hit.name : cleanName,
        muscleGroup: ex.muscleGroup || (hit ? hit.muscle_group : ''),
        notes: humanizeCue(ex.notes),
        isWarmup: !!isWarm,
        isStretch: !!isStretch,
        phase: isWarm ? 'warmup' : (isStretch ? 'cooldown' : 'main'),
      };
      if (hit) {
        matched++;
        return {
          ...base,
          id: hit.id,
          video_url: hit.video_url,
          animation_url: hit.animation_url,
          thumbnail_url: hit.thumbnail_url,
          muscle_group: hit.muscle_group,
          equipment: hit.equipment,
          instructions: hit.instructions,
          isCustom: !!hit.coach_id,
          matched: true,
        };
      }
      return { ...base, matched: false };
    });

    const workout = {
      name: parsed.name || 'Adjusted Workout',
      exercises: matchedExercises,
    };

    // Return in the same envelope generate-workout-claude uses for a single
    // workout, so the client reads program.weeks[0].workouts[0] unchanged.
    const program = { weeks: [{ weekNumber: 1, workouts: [workout] }] };
    normalizeSupersetRest(program.weeks);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program,
        situation: sit,
        matchStats: { total: matchedExercises.length, matched },
      }),
    };
  } catch (error) {
    console.error('Adjust workout error:', error.message);
    let userMessage = 'Could not adjust your workout. Please try again.';
    if (error.status === 429) userMessage = 'The AI is busy right now. Wait a moment and try again.';
    else if (error.message?.includes('parse')) userMessage = 'The AI returned something unexpected. Please try again.';
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: userMessage }) };
  }
};
