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

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
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
      coachId,
      clientId,
      limit = '30',
      offset = '0'
    } = event.queryStringParameters || {};

    if (!coachId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId is required' })
      };
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    // Step 1: Get all clients for this coach
    let clientsQuery = supabase
      .from('clients')
      .select('id, client_name')
      .eq('coach_id', coachId);

    if (clientId) {
      clientsQuery = clientsQuery.eq('id', clientId);
    }

    const { data: clients, error: clientsError } = await clientsQuery;

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: clientsError.message }) };
    }

    if (!clients || clients.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ feed: [], hasMore: false, clients: {} })
      };
    }

    // Build client map
    const clientMap = {};
    clients.forEach(c => {
      clientMap[c.id] = { name: c.client_name || 'Client' };
    });

    const clientIds = clients.map(c => c.id);

    // Step 2: Get recent workout_logs for those clients
    const { data: workoutLogs, error: logsError } = await supabase
      .from('workout_logs')
      .select('*')
      .in('client_id', clientIds)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('workout_date', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit);

    if (logsError) {
      console.error('Error fetching workout logs:', logsError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: logsError.message }) };
    }

    if (!workoutLogs || workoutLogs.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ feed: [], hasMore: false, clients: clientMap })
      };
    }

    const hasMore = workoutLogs.length > parsedLimit;
    const logsToProcess = workoutLogs.slice(0, parsedLimit);
    const workoutLogIds = logsToProcess.map(w => w.id);

    // Step 3: Get exercise_logs for all these workout logs
    const { data: exerciseLogs, error: exerciseError } = await supabase
      .from('exercise_logs')
      .select('*')
      .in('workout_log_id', workoutLogIds)
      .order('exercise_order', { ascending: true });

    if (exerciseError) {
      console.error('Error fetching exercise logs:', exerciseError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: exerciseError.message }) };
    }

    // Group exercise logs by workout_log_id
    const exercisesByWorkout = {};
    (exerciseLogs || []).forEach(ex => {
      if (!exercisesByWorkout[ex.workout_log_id]) {
        exercisesByWorkout[ex.workout_log_id] = [];
      }
      exercisesByWorkout[ex.workout_log_id].push(ex);
    });

    // Step 5: For improvements, we need previous workout logs with the same workout_name per client
    // Collect unique client+workout_name pairs
    const workoutKeys = new Set();
    logsToProcess.forEach(w => {
      if (w.workout_name) {
        workoutKeys.add(`${w.client_id}::${w.workout_name}`);
      }
    });

    // For each current workout, find its previous occurrence to calculate improvements
    // We need to look up previous workout logs for the same client+workout_name
    // that occurred before the current one
    const previousVolumeMap = {};

    if (workoutKeys.size > 0) {
      // Get all workout_names and client_ids we need to look up
      const lookupPromises = logsToProcess
        .filter(w => w.workout_name)
        .map(async (w) => {
          const { data: prevLogs } = await supabase
            .from('workout_logs')
            .select('id, total_volume, workout_date, completed_at')
            .eq('client_id', w.client_id)
            .eq('workout_name', w.workout_name)
            .neq('id', w.id)
            .order('workout_date', { ascending: false })
            .limit(1);

          if (prevLogs && prevLogs.length > 0) {
            previousVolumeMap[w.id] = prevLogs[0].total_volume;
          }
        });

      await Promise.all(lookupPromises);
    }

    // Step 4: Transform into feed items
    const feed = logsToProcess.map(w => {
      const exercises = (exercisesByWorkout[w.id] || []).map(ex => ({
        exerciseName: ex.exercise_name,
        totalSets: ex.total_sets || 0,
        totalReps: ex.total_reps || 0,
        maxWeight: ex.max_weight || 0,
        totalVolume: ex.total_volume || 0,
        isPr: ex.is_pr || false,
        clientNotes: ex.client_notes || null,
        clientVoiceNotePath: ex.client_voice_note_path || null,
        setsData: ex.sets_data || []
      }));

      // Flag if any exercise in this workout has client notes
      const hasClientNotes = exercises.some(ex => ex.clientNotes || ex.clientVoiceNotePath);

      // Calculate improvements
      const newPRs = exercises.filter(ex => ex.isPr).length;
      let volumeChange = null;

      const prevVolume = previousVolumeMap[w.id];
      if (prevVolume !== undefined && prevVolume > 0 && w.total_volume != null) {
        volumeChange = parseFloat((((w.total_volume - prevVolume) / prevVolume) * 100).toFixed(1));
      }

      return {
        id: w.id,
        clientId: w.client_id,
        clientName: clientMap[w.client_id]?.name || 'Client',
        workoutDate: w.workout_date,
        workoutName: w.workout_name,
        status: w.status,
        completedAt: w.completed_at,
        durationMinutes: w.duration_minutes || null,
        totalVolume: w.total_volume || 0,
        totalSets: w.total_sets || 0,
        totalReps: w.total_reps || 0,
        workoutRating: w.workout_rating || null,
        energyLevel: w.energy_level || null,
        exercises,
        hasClientNotes,
        improvements: {
          volumeChange,
          newPRs
        }
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        feed,
        hasMore,
        clients: clientMap
      })
    };

  } catch (err) {
    console.error('Coach workout feed error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
