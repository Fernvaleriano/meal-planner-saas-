// Netlify Function — refine an existing AI-generated workout via natural-language chat.
// Coaches can say "swap day 3 for a different leg day", "make it harder", "add more arm work",
// "shorten rest", "remove all overhead pressing", etc.
//
// Inputs:
//   { program: <full program JSON>, instruction: "...", coachId, scope: "all" | "day:N" }
// Output: same program JSON shape with the requested edits applied.
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

// Reuse cache pattern (per-process) for the exercise DB
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

function normalizeExerciseName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function findBestMatch(aiName, exercises) {
  const target = normalizeExerciseName(aiName);
  const exact = exercises.find(e => normalizeExerciseName(e.name) === target);
  if (exact) return exact;
  // contains match
  return exercises.find(e => normalizeExerciseName(e.name).includes(target) || target.includes(normalizeExerciseName(e.name))) || null;
}

// Multi-week progression — duplicated from generate-workout-claude.js so we can
// rebuild weeks 2..N after refining week 1. Keep these two implementations in sync.
function generateMultiWeekProgression(week1Workouts, totalWeeks, goal) {
  if (totalWeeks <= 1) return [];
  const additionalWeeks = [];
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
          progressNote = `Week ${w} (DELOAD): drop 1 set, use ~70% of recent working weight, focus on form`;
        } else if (goal === 'strength') {
          progressNote = `Week ${w}: add 2.5-5 lb to working weight; if all reps hit at top of range, increase 5-10 lb next week`;
        } else if (goal === 'hypertrophy') {
          const range = baseReps.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (range) {
            const lowRep = parseInt(range[1]);
            const highRep = parseInt(range[2]);
            const repBump = Math.min(highRep, lowRep + (weekIndex - 1));
            newReps = `${repBump}-${highRep}`;
            if (weekIndex >= 3) newSets = baseSets + 1;
            progressNote = `Week ${w}: aim for ${newReps} reps. Once you hit ${highRep} on all sets, add 5 lb next week.`;
          } else {
            progressNote = `Week ${w}: aim for 1-2 more reps than last week, or +2.5-5 lb if reps held`;
          }
        } else {
          const baseRest = Number(ex.restSeconds) || 60;
          const newRest = Math.max(20, baseRest - 10 * (weekIndex - 1));
          progressNote = `Week ${w}: shorten rest to ${newRest}s to increase density`;
          return { ...ex, restSeconds: newRest, notes: ex.notes ? `${ex.notes} | ${progressNote}` : progressNote };
        }
        return { ...ex, sets: newSets, reps: newReps, notes: ex.notes ? `${ex.notes} | ${progressNote}` : progressNote };
      });
      return { ...workout, exercises };
    });
    additionalWeeks.push({ weekNumber: w, workouts, isDeload });
  }
  return additionalWeeks;
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ success: false, error: 'AI service unavailable' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Server not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { program, instruction, coachId = null, scope = 'all', equipment = [] } = body;

    if (!program || !program.weeks) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Valid program is required' }) };
    }
    if (!instruction || typeof instruction !== 'string' || instruction.trim().length < 3) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Instruction is required (e.g. "make day 3 harder")' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const allExercises = await loadExercises(supabase, coachId);
    const exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);

    // Build a compact exercise reference for the prompt — group + sample 30 per group
    const byGroup = {};
    for (const ex of exercisesWithVideos) {
      const g = (ex.muscle_group || 'other').toLowerCase();
      if (!byGroup[g]) byGroup[g] = [];
      const customLabel = ex.coach_id ? ' (custom)' : '';
      byGroup[g].push(`${ex.name}${customLabel}`);
    }
    const exerciseList = Object.entries(byGroup)
      .map(([g, list]) => `${g.toUpperCase()}: ${list.slice(0, 30).join(', ')}`)
      .join('\n');

    // To stay under output token limits, refine ONLY week 1 (the editor's source
    // of truth). Weeks 2..N are programmatically rebuilt afterwards.
    const fullProgram = JSON.parse(JSON.stringify(program)); // deep clone for return
    const originalWeekCount = fullProgram.weeks.length;
    const originalGoal = fullProgram.goal || 'hypertrophy';
    const week1Only = {
      programName: fullProgram.programName,
      description: fullProgram.description,
      goal: fullProgram.goal,
      difficulty: fullProgram.difficulty,
      daysPerWeek: fullProgram.daysPerWeek,
      weeks: [fullProgram.weeks[0]] // ONLY week 1
    };

    let scopeNote = 'Apply the change across the whole week (it will be propagated to weeks 2..N automatically).';
    if (scope?.startsWith('day:')) {
      const dayNum = parseInt(scope.split(':')[1]);
      scopeNote = `Apply the change ONLY to dayNumber ${dayNum} in week 1. Leave the other days in week 1 unchanged.`;
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are a senior strength coach refining an existing workout program based on the head coach's instruction.

YOUR JOB: Edit the provided WEEK 1 program JSON to satisfy the instruction. Return the FULL modified WEEK 1 JSON with edits applied.

RULES:
- ${scopeNote}
- Use ONLY exercises from the AVAILABLE EXERCISES list below (custom exercises are PREFERRED).
- Preserve the existing JSON shape exactly: weeks[].workouts[].exercises[] with fields name, muscleGroup, sets, reps, restSeconds, notes, isSuperset, supersetGroup, isWarmup, isStretch, phase.
- Do not invent new fields. Do not add markdown.
- If the instruction is destructive (e.g. "remove all overhead pressing"), remove those exercises and replace them with safe alternatives so the workout still has full volume.
- Preserve warmups and stretches at the start/end of each day unless explicitly told to change them.
- "Make it harder" → add 1 set OR increase reps OR shorten rest by 15-30s. Don't double everything.
- "Make it easier" / "decrease volume" → drop 1 set OR reduce reps OR add 30s rest. Aim for ~20-25% volume reduction.
- "Add more X work" → add 1-2 exercises targeting that muscle to the most relevant day.
- If asked to swap an entire day, preserve the day's overall muscle target.
${equipment.length ? `- Equipment available: ${equipment.join(', ')}. Don't introduce exercises requiring other equipment.` : ''}

AVAILABLE EXERCISES (ONLY use these):
${exerciseList}

Return ONLY the modified WEEK 1 JSON, nothing else.`;

    const userMessage = `INSTRUCTION FROM HEAD COACH: "${instruction.trim()}"

CURRENT WEEK 1 PROGRAM:
${JSON.stringify(week1Only, null, 2)}

Return the modified WEEK 1 program JSON.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16384,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt
    });

    const responseText = message.content[0]?.text || '';
    let updatedProgram;
    try {
      updatedProgram = JSON.parse(responseText.trim());
    } catch (e) {
      const codeBlock = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlock) updatedProgram = JSON.parse(codeBlock[1].trim());
      else {
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) updatedProgram = JSON.parse(objectMatch[0]);
        else throw new Error('Could not parse refined program');
      }
    }

    if (!updatedProgram?.weeks || !Array.isArray(updatedProgram.weeks) || !updatedProgram.weeks[0]) {
      throw new Error('Refined program has invalid structure');
    }

    // Re-match exercises to DB so video/thumbnail URLs are repopulated.
    // We only operated on week 1, so just match week 1.
    let matchStats = { total: 0, matched: 0, unmatched: 0 };
    const refinedWeek1 = updatedProgram.weeks[0];
    for (const workout of (refinedWeek1.workouts || [])) {
      workout.exercises = (workout.exercises || []).map(ex => {
        ex.name = (ex.name || '').replace(/\s*\(custom\)\s*$/i, '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
        matchStats.total++;
        const match = findBestMatch(ex.name, exercisesWithVideos);
        if (match) {
          matchStats.matched++;
          return {
            ...ex,
            id: match.id,
            name: match.name,
            video_url: match.video_url,
            animation_url: match.animation_url,
            thumbnail_url: match.thumbnail_url,
            muscle_group: match.muscle_group,
            equipment: match.equipment,
            instructions: match.instructions,
            isCustom: !!match.coach_id,
            matched: true
          };
        }
        matchStats.unmatched++;
        return { ...ex, matched: false };
      });
    }

    // Reassemble the full program: refined week 1, plus regenerated weeks 2..N
    // (only if the original program had multiple weeks).
    if (originalWeekCount > 1) {
      const newWeeks2plus = generateMultiWeekProgression(refinedWeek1.workouts, originalWeekCount, originalGoal);
      fullProgram.weeks = [refinedWeek1, ...newWeeks2plus];
    } else {
      fullProgram.weeks = [refinedWeek1];
    }
    // Carry over refined top-level metadata if Claude updated it
    if (updatedProgram.programName) fullProgram.programName = updatedProgram.programName;
    if (updatedProgram.description) fullProgram.description = updatedProgram.description;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, program: fullProgram, matchStats, instruction: instruction.trim(), scope, weeksRebuilt: originalWeekCount > 1 })
    };

  } catch (error) {
    console.error('Refine error:', error.message);
    let userMessage = 'Failed to refine workout. Please try again.';
    if (error.status === 429) userMessage = 'AI service is busy. Wait a moment and retry.';
    else if (error.message?.includes('parse')) userMessage = 'AI returned malformed output. Try rephrasing the instruction.';
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ success: false, error: userMessage })
    };
  }
};
