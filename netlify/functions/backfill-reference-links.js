const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Merge global reference links into an exercise object (mutates in place)
// Returns true if the exercise was modified
function mergeRefs(exercise, refsMap) {
  if (!exercise || !exercise.name) return false;
  const globalRefs = refsMap[exercise.name.toLowerCase()];
  if (!globalRefs || globalRefs.length === 0) return false;

  let refLinks = Array.isArray(exercise.reference_links) ? exercise.reference_links : [];
  if (refLinks.length === 0) {
    exercise.reference_links = globalRefs.map(ref => ({ ...ref }));
    return true;
  }

  // Merge: add global refs not already present
  const existingUrls = new Set(refLinks.map(l => l.url));
  let added = false;
  globalRefs.forEach(ref => {
    if (!existingUrls.has(ref.url)) {
      refLinks.push({ ...ref });
      added = true;
    }
  });
  if (added) {
    exercise.reference_links = refLinks;
  }
  return added;
}

// Patch all exercises in a JSONB workout data blob
// Handles both { days: [{ exercises }] } and { exercises: [] } formats
function patchWorkoutData(workoutData, refsMap) {
  if (!workoutData) return false;
  let modified = false;

  // Days format: { days: [{ exercises: [...] }] }
  if (Array.isArray(workoutData.days)) {
    workoutData.days.forEach(day => {
      if (Array.isArray(day.exercises)) {
        day.exercises.forEach(ex => {
          if (mergeRefs(ex, refsMap)) modified = true;
        });
      }
    });
  }

  // Flat format: { exercises: [...] }
  if (Array.isArray(workoutData.exercises)) {
    workoutData.exercises.forEach(ex => {
      if (mergeRefs(ex, refsMap)) modified = true;
    });
  }

  return modified;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId } = JSON.parse(event.body || '{}');
    if (!coachId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId is required' }) };
    }

    // 1. Fetch coach's global exercise references
    const { data: globalRefs, error: refsError } = await supabase
      .from('coach_exercise_references')
      .select('exercise_name, reference_links')
      .eq('coach_id', coachId);

    if (refsError) throw refsError;

    if (!globalRefs || globalRefs.length === 0) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ message: 'No global references found for this coach', stats: { programs: 0, assignments: 0, adhoc: 0 } })
      };
    }

    // Build reference map keyed by lowercase exercise name
    const refsMap = {};
    globalRefs.forEach(ref => {
      refsMap[ref.exercise_name.toLowerCase()] = ref.reference_links || [];
    });

    const stats = { programs: 0, assignments: 0, adhoc: 0 };

    // 2. Patch workout_programs
    const { data: programs, error: progError } = await supabase
      .from('workout_programs')
      .select('id, program_data')
      .eq('coach_id', coachId);

    if (progError) throw progError;

    for (const program of (programs || [])) {
      if (program.program_data && patchWorkoutData(program.program_data, refsMap)) {
        const { error: updateErr } = await supabase
          .from('workout_programs')
          .update({ program_data: program.program_data })
          .eq('id', program.id);
        if (updateErr) console.error('Error updating program', program.id, updateErr);
        else stats.programs++;
      }
    }

    // 3. Patch client_workout_assignments
    const { data: assignments, error: assignError } = await supabase
      .from('client_workout_assignments')
      .select('id, workout_data')
      .eq('coach_id', coachId);

    if (assignError) throw assignError;

    for (const assignment of (assignments || [])) {
      if (assignment.workout_data && patchWorkoutData(assignment.workout_data, refsMap)) {
        const { error: updateErr } = await supabase
          .from('client_workout_assignments')
          .update({ workout_data: assignment.workout_data })
          .eq('id', assignment.id);
        if (updateErr) console.error('Error updating assignment', assignment.id, updateErr);
        else stats.assignments++;
      }
    }

    // 4. Patch client_adhoc_workouts for this coach's clients
    const { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', coachId);

    if (clientError) throw clientError;

    const clientIds = (clients || []).map(c => c.id);
    if (clientIds.length > 0) {
      const { data: adhocWorkouts, error: adhocError } = await supabase
        .from('client_adhoc_workouts')
        .select('id, workout_data')
        .in('client_id', clientIds);

      if (adhocError) throw adhocError;

      for (const adhoc of (adhocWorkouts || [])) {
        if (adhoc.workout_data && patchWorkoutData(adhoc.workout_data, refsMap)) {
          const { error: updateErr } = await supabase
            .from('client_adhoc_workouts')
            .update({ workout_data: adhoc.workout_data })
            .eq('id', adhoc.id);
          if (updateErr) console.error('Error updating adhoc workout', adhoc.id, updateErr);
          else stats.adhoc++;
        }
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        message: `Backfill complete. Updated ${stats.programs} programs, ${stats.assignments} assignments, ${stats.adhoc} ad-hoc workouts.`,
        stats
      })
    };

  } catch (err) {
    console.error('Backfill error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
