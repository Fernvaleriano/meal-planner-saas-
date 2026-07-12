// Lightweight "memory" for the member-facing AI workout generator.
//
// Returns what the client trained recently so the Generate Workout modal can:
//   1. Suggest today's focus (trained push yesterday → suggest pull or legs)
//   2. Tell the generator which exercises they just did, so it avoids
//      repeating them (passed back as excludeExerciseNames)
//
// Read-only, no AI tokens spent. If this endpoint fails the modal simply
// behaves like before (no suggestion, no exclusions) — it must never block
// generation.
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateClientAccess } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

// Coarse training buckets used for the focus suggestion. Muscle groups come
// from the exercises table (same values the generator's volume check maps).
function bucketOf(muscleGroup) {
  const g = (muscleGroup || '').toLowerCase();
  if (/chest|pec|shoulder|delt|tricep/.test(g)) return 'push';
  if (/back|lat|trap|rhomboid|bicep/.test(g)) return 'pull';
  if (/leg|quad|hamstring|glute|calf|calves/.test(g)) return 'legs';
  if (/core|ab|oblique/.test(g)) return 'core';
  return null;
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { clientId } = event.queryStringParameters || {};
  if (!clientId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
  }

  // Same access rule as the rest of the client endpoints: the client
  // themselves or their coach/gym.
  const { error: authError } = await authenticateClientAccess(event, clientId);
  if (authError) return authError;

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: workouts, error: logsError } = await supabase
      .from('workout_logs')
      .select('id, workout_date')
      .eq('client_id', clientId)
      .gte('workout_date', daysAgo(14))
      .order('workout_date', { ascending: false })
      .limit(10);
    if (logsError) throw logsError;

    if (!workouts || workouts.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, suggestedFocus: null, lastWorkout: null, recentExerciseNames: [] })
      };
    }

    const { data: exLogs } = await supabase
      .from('exercise_logs')
      .select('workout_log_id, exercise_name')
      .in('workout_log_id', workouts.map(w => w.id))
      .limit(300);

    const namesByWorkout = new Map();
    const uniqueNames = new Set();
    for (const log of (exLogs || [])) {
      if (!log.exercise_name) continue;
      if (!namesByWorkout.has(log.workout_log_id)) namesByWorkout.set(log.workout_log_id, []);
      namesByWorkout.get(log.workout_log_id).push(log.exercise_name);
      uniqueNames.add(log.exercise_name);
    }

    // Map logged exercise names → muscle groups via the library. Logged names
    // come from DB-matched exercises, so an exact IN lookup covers them.
    const groupByName = new Map();
    if (uniqueNames.size > 0) {
      const { data: exercises } = await supabase
        .from('exercises')
        .select('name, muscle_group')
        .in('name', Array.from(uniqueNames))
        .limit(500);
      for (const ex of (exercises || [])) {
        groupByName.set(ex.name.toLowerCase(), ex.muscle_group);
      }
    }

    // What buckets did each recent workout hit, and when was each bucket
    // last trained?
    const lastTrained = {}; // bucket → most recent workout_date
    let lastWorkout = null;
    for (const w of workouts) {
      const buckets = new Set();
      for (const name of (namesByWorkout.get(w.id) || [])) {
        const b = bucketOf(groupByName.get(name.toLowerCase()));
        if (b) buckets.add(b);
      }
      if (buckets.size === 0) continue;
      if (!lastWorkout) lastWorkout = { date: w.workout_date, buckets: Array.from(buckets) };
      for (const b of buckets) {
        if (!lastTrained[b] || w.workout_date > lastTrained[b]) lastTrained[b] = w.workout_date;
      }
    }

    // Suggest the big bucket that's gone longest without work. Never-trained
    // beats any date; iteration order breaks ties deterministically.
    let suggestedFocus = null;
    if (lastWorkout) {
      let bestDate;
      for (const b of ['legs', 'pull', 'push']) {
        const d = lastTrained[b] || '';
        if (bestDate === undefined || d < bestDate) {
          bestDate = d;
          suggestedFocus = b;
        }
      }
    }

    // Exercises from the last few days — the generator excludes these from its
    // candidate pool so back-to-back sessions don't repeat the same moves.
    // Lifts the client is actively PRing are re-added by the generator's
    // keep-mandate, so progress work is never lost to variety.
    const cutoff = daysAgo(4);
    const recentExerciseNames = [];
    const seen = new Set();
    for (const w of workouts) {
      if (w.workout_date < cutoff) continue;
      for (const name of (namesByWorkout.get(w.id) || [])) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        recentExerciseNames.push(name);
        if (recentExerciseNames.length >= 40) break;
      }
      if (recentExerciseNames.length >= 40) break;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, suggestedFocus, lastWorkout, recentExerciseNames })
    };
  } catch (error) {
    console.error('ai-workout-memory error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to load workout history' }) };
  }
};
