const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
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
    const {
      clientId,
      exerciseId,
      exerciseName,
      startDate,
      endDate,
      limit = 30
    } = event.queryStringParameters || {};

    if (!clientId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId is required' })
      };
    }

    // Build query for exercise history
    let query = supabase
      .from('exercise_logs')
      .select(`
        id,
        exercise_id,
        exercise_name,
        sets_data,
        total_sets,
        total_reps,
        total_volume,
        max_weight,
        is_pr,
        notes,
        created_at,
        workout_logs!inner(
          id,
          workout_date,
          client_id
        )
      `)
      .eq('workout_logs.client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Filter by exercise
    if (exerciseId) {
      query = query.eq('exercise_id', exerciseId);
    } else if (exerciseName) {
      // Use exact match by default to avoid cross-exercise confusion
      // (e.g. "Hack Squat" matching "Hack Squat Single Leg" could suggest unsafe weights)
      query = query.ilike('exercise_name', exerciseName);
    }

    // Date range filters
    if (startDate) {
      query = query.gte('workout_logs.workout_date', startDate);
    }
    if (endDate) {
      query = query.lte('workout_logs.workout_date', endDate);
    }

    const { data: history, error } = await query;

    if (error) throw error;

    // Transform data for easier consumption
    const transformedHistory = (history || []).map(item => ({
      id: item.id,
      exerciseId: item.exercise_id,
      exerciseName: item.exercise_name,
      setsData: item.sets_data,
      totalSets: item.total_sets,
      totalReps: item.total_reps,
      totalVolume: item.total_volume,
      maxWeight: item.max_weight,
      isPr: item.is_pr,
      notes: item.notes,
      workoutDate: item.workout_logs?.workout_date,
      workoutId: item.workout_logs?.id
    }));

    // Calculate stats if filtering by specific exercise
    let stats = null;
    if (exerciseId || exerciseName) {
      const allMaxWeights = transformedHistory.map(h => h.maxWeight).filter(w => w > 0);
      const allVolumes = transformedHistory.map(h => h.totalVolume).filter(v => v > 0);

      if (allMaxWeights.length > 0) {
        stats = {
          allTimeMaxWeight: Math.max(...allMaxWeights),
          recentMaxWeight: allMaxWeights[0] || 0,
          totalWorkouts: transformedHistory.length,
          totalVolume: allVolumes.reduce((sum, v) => sum + v, 0),
          averageVolume: Math.round(allVolumes.reduce((sum, v) => sum + v, 0) / allVolumes.length),
          prCount: transformedHistory.filter(h => h.isPr).length
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        history: transformedHistory,
        stats
      })
    };

  } catch (err) {
    console.error('Exercise history error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
