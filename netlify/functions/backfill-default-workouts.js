const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_PROGRAMS, ALL_DEFAULT_PROGRAM_NAMES } = require('./seed-default-workouts');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BACKFILL_TOKEN = process.env.DEFAULT_WORKOUTS_BACKFILL_TOKEN;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-backfill-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function getTokenFromHeaders(event) {
  const direct = event.headers?.['x-backfill-token'] || event.headers?.['X-Backfill-Token'];
  if (direct) return direct;

  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

function buildRowsForCoach(coachId, exerciseLookup) {
  return DEFAULT_PROGRAMS.map(prog => {
    const enrichedDays = prog.program_data.days.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => {
        const dbMatch = exerciseLookup.get(ex.name.toLowerCase());
        if (!dbMatch) return ex;

        return {
          ...ex,
          id: dbMatch.id,
          video_url: dbMatch.video_url || null,
          animation_url: dbMatch.animation_url || null,
          thumbnail_url: dbMatch.thumbnail_url || null,
          muscle_group: dbMatch.muscle_group || ex.muscle_group,
          equipment: dbMatch.equipment || ex.equipment
        };
      })
    }));

    return {
      coach_id: coachId,
      name: prog.name,
      description: prog.description,
      program_type: prog.program_type,
      difficulty: prog.difficulty,
      days_per_week: prog.days_per_week,
      program_data: { days: enrichedDays },
      is_template: true,
      is_published: false,
      is_club_workout: false
    };
  });
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

  if (!BACKFILL_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'DEFAULT_WORKOUTS_BACKFILL_TOKEN is not configured' }) };
  }

  const requestToken = getTokenFromHeaders(event);
  if (!requestToken || requestToken !== BACKFILL_TOKEN) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, dryRun = true, limit = 500 } = JSON.parse(event.body || '{}');

    let coachIds = [];
    if (coachId) {
      coachIds = [coachId];
    } else {
      const { data: coaches, error: coachesError } = await supabase
        .from('coaches')
        .select('id')
        .limit(limit);

      if (coachesError) throw coachesError;
      coachIds = (coaches || []).map(c => c.id).filter(Boolean);
    }

    if (coachIds.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'No coaches found to process', processed: 0, dryRun })
      };
    }

    const allExerciseNames = [...new Set(
      DEFAULT_PROGRAMS.flatMap(program =>
        (program.program_data.days || []).flatMap(day =>
          (day.exercises || []).map(ex => ex.name)
        )
      )
    )];

    const { data: dbExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment')
      .is('coach_id', null)
      .in('name', allExerciseNames);

    if (exError) throw exError;

    const exerciseLookup = new Map((dbExercises || []).map(ex => [ex.name.toLowerCase(), ex]));

    const report = [];

    for (const id of coachIds) {
      const coachReport = { coachId: id, deleted: 0, inserted: 0 };

      const deleteQuery = supabase
        .from('workout_programs')
        .delete({ count: 'exact' })
        .eq('coach_id', id)
        .eq('is_template', true)
        .in('name', ALL_DEFAULT_PROGRAM_NAMES);

      if (dryRun) {
        const { count, error } = await supabase
          .from('workout_programs')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', id)
          .eq('is_template', true)
          .in('name', ALL_DEFAULT_PROGRAM_NAMES);

        if (error) throw error;
        coachReport.deleted = count || 0;
        coachReport.inserted = DEFAULT_PROGRAMS.length;
      } else {
        const { count: deletedCount, error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
        coachReport.deleted = deletedCount || 0;

        const rows = buildRowsForCoach(id, exerciseLookup);
        const { data: inserted, error: insertError } = await supabase
          .from('workout_programs')
          .insert(rows)
          .select('id');

        if (insertError) throw insertError;
        coachReport.inserted = (inserted || []).length;
      }

      report.push(coachReport);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun,
        processed: coachIds.length,
        report
      })
    };
  } catch (error) {
    console.error('Backfill default workouts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to backfill default workouts' })
    };
  }
};
