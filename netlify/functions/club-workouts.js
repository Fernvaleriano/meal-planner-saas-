const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch club workouts (reads from workout_programs where is_club_workout = true)
    // Returns individual day workouts extracted from programs for clients to browse
    if (event.httpMethod === 'GET') {
      const { coachId } = event.queryStringParameters || {};

      if (!coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      const { data: programs, error } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('coach_id', coachId)
        .eq('is_club_workout', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching club workouts:', error);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ workouts: [] })
        };
      }

      // Transform programs into individual day workouts for clients to browse
      const workouts = [];
      for (const program of (programs || [])) {
        // AI-generated programs (generate-workout-claude.js) use weeks[].workouts[] structure
        // Manual/coach programs use days[] structure. Handle both.
        let days = program.program_data?.days || [];
        if (days.length === 0 && Array.isArray(program.program_data?.weeks)) {
          // Flatten weeks[].workouts[] into a flat days-like array
          for (const week of program.program_data.weeks) {
            if (Array.isArray(week.workouts)) {
              for (const workout of week.workouts) {
                days.push({
                  name: workout.name || `Day ${workout.dayNumber || days.length + 1}`,
                  exercises: workout.exercises || [],
                  targetMuscles: workout.targetMuscles || []
                });
              }
            }
          }
        }

        if (days.length === 1) {
          // Single-day program: show as one workout
          const day = days[0];
          workouts.push({
            id: `${program.id}-0`,
            program_id: program.id,
            day_index: 0,
            name: program.name,
            description: program.description,
            category: program.program_type || 'general',
            difficulty: program.difficulty,
            image_url: program.program_data?.image_url || null,
            workout_data: {
              exercises: day.exercises || [],
              estimatedMinutes: estimateMinutes(day.exercises),
              estimatedCalories: estimateCalories(day.exercises),
              dayName: day.name
            }
          });
        } else {
          // Multi-day program: each day becomes a separate browseable workout
          days.forEach((day, index) => {
            if (day.exercises && day.exercises.length > 0) {
              workouts.push({
                id: `${program.id}-${index}`,
                program_id: program.id,
                day_index: index,
                name: `${program.name} — ${day.name || `Day ${index + 1}`}`,
                description: program.description,
                category: program.program_type || 'general',
                difficulty: program.difficulty,
                image_url: program.program_data?.image_url || null,
                workout_data: {
                  exercises: day.exercises || [],
                  estimatedMinutes: estimateMinutes(day.exercises),
                  estimatedCalories: estimateCalories(day.exercises),
                  dayName: day.name || `Day ${index + 1}`
                }
              });
            }
          });
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ workouts })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Club workouts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

function estimateMinutes(exercises) {
  if (!exercises || exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
    const restSeconds = ex.restSeconds || 60;
    totalSeconds += numSets * 40 + (numSets - 1) * restSeconds;
  }
  totalSeconds += (exercises.length - 1) * 30;
  return Math.ceil(totalSeconds / 60);
}

function estimateCalories(exercises) {
  return Math.round(estimateMinutes(exercises) * 5);
}
