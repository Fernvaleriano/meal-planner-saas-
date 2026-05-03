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

    // Pull just the slice we need to refine to keep the prompt small
    let workingProgram = JSON.parse(JSON.stringify(program)); // deep clone
    let scopeNote = 'Apply the change across the entire program.';
    if (scope?.startsWith('day:')) {
      const dayNum = parseInt(scope.split(':')[1]);
      scopeNote = `Apply the change ONLY to dayNumber ${dayNum} of week 1. Leave other days unchanged.`;
    } else if (scope?.startsWith('week:')) {
      const weekNum = parseInt(scope.split(':')[1]);
      scopeNote = `Apply the change ONLY to week ${weekNum}. Leave other weeks unchanged.`;
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are a senior strength coach refining an existing workout program based on the head coach's instruction.

YOUR JOB: Edit the provided program JSON to satisfy the instruction. Return the FULL modified program JSON — same structure, same week/day count — with edits applied.

RULES:
- ${scopeNote}
- Use ONLY exercises from the AVAILABLE EXERCISES list below (custom exercises are PREFERRED).
- Preserve the existing JSON shape exactly: weeks[].workouts[].exercises[] with fields name, muscleGroup, sets, reps, restSeconds, notes, isSuperset, supersetGroup, isWarmup, isStretch, phase.
- Do not invent new fields. Do not add markdown.
- If the instruction is destructive (e.g. "remove all overhead pressing"), remove those exercises and replace them with safe alternatives so the workout still has full volume.
- Preserve warmups and stretches at the start/end of each day unless explicitly told to change them.
- If asked to "make it harder": add 1 set OR increase reps OR shorten rest by 15-30s. Don't double everything.
- If asked to "make it easier": drop 1 set OR reduce reps OR add 30s rest.
- If asked to swap an entire day, preserve the day's overall muscle target.
${equipment.length ? `- Equipment available: ${equipment.join(', ')}. Don't introduce exercises requiring other equipment.` : ''}

AVAILABLE EXERCISES (ONLY use these):
${exerciseList}

Return ONLY the modified program JSON, nothing else.`;

    const userMessage = `INSTRUCTION FROM HEAD COACH: "${instruction.trim()}"

CURRENT PROGRAM:
${JSON.stringify(workingProgram, null, 2)}

Return the modified program JSON.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
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

    if (!updatedProgram?.weeks || !Array.isArray(updatedProgram.weeks)) {
      throw new Error('Refined program has invalid structure');
    }

    // Re-match exercises to DB so video/thumbnail URLs are repopulated
    let matchStats = { total: 0, matched: 0, unmatched: 0 };
    for (const week of updatedProgram.weeks) {
      for (const workout of (week.workouts || [])) {
        workout.exercises = (workout.exercises || []).map(ex => {
          // Strip "(custom)" / "[equipment]" labels
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
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, program: updatedProgram, matchStats, instruction: instruction.trim(), scope })
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
