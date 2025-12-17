const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    // GET - Fetch workout logs
    if (event.httpMethod === 'GET') {
      const {
        clientId,
        workoutId,
        startDate,
        endDate,
        limit = 30
      } = event.queryStringParameters || {};

      // Get single workout by ID with exercise logs
      if (workoutId) {
        const { data: workout, error: workoutError } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('id', workoutId)
          .single();

        if (workoutError) throw workoutError;

        // Get exercise logs for this workout
        const { data: exercises, error: exerciseError } = await supabase
          .from('exercise_logs')
          .select('*')
          .eq('workout_log_id', workoutId)
          .order('exercise_order', { ascending: true });

        if (exerciseError) throw exerciseError;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            workout: {
              ...workout,
              exercises: exercises || []
            }
          })
        };
      }

      // Get all workouts for a client
      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      let query = supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('workout_date', { ascending: false })
        .limit(parseInt(limit));

      if (startDate) {
        query = query.gte('workout_date', startDate);
      }
      if (endDate) {
        query = query.lte('workout_date', endDate);
      }

      const { data: workouts, error } = await query;

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ workouts: workouts || [] })
      };
    }

    // POST - Create/start a workout log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        coachId,
        assignmentId,
        workoutDate,
        workoutName,
        exercises, // Array of exercise data
        timezone
      } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      // Create workout log
      const { data: workout, error: workoutError } = await supabase
        .from('workout_logs')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          assignment_id: assignmentId,
          workout_date: getDefaultDate(workoutDate, timezone),
          workout_name: workoutName,
          started_at: new Date().toISOString(),
          status: 'in_progress'
        }])
        .select()
        .single();

      if (workoutError) throw workoutError;

      // If exercises provided, create exercise logs
      if (exercises && exercises.length > 0) {
        const exerciseLogs = exercises.map((ex, index) => ({
          workout_log_id: workout.id,
          exercise_id: ex.exerciseId,
          exercise_name: ex.exerciseName,
          exercise_order: index + 1,
          sets_data: ex.sets || [],
          total_sets: ex.sets?.length || 0,
          total_reps: ex.sets?.reduce((sum, s) => sum + (s.reps || 0), 0) || 0,
          total_volume: ex.sets?.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight || 0)), 0) || 0,
          max_weight: Math.max(...(ex.sets?.map(s => s.weight || 0) || [0])),
          notes: ex.notes
        }));

        const { error: exerciseError } = await supabase
          .from('exercise_logs')
          .insert(exerciseLogs);

        if (exerciseError) throw exerciseError;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // PUT - Update workout log (complete workout, add exercises, update sets)
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { workoutId, exercises, ...updateData } = body;

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      // Build workout update fields
      const updateFields = {};
      if (updateData.workoutName !== undefined) updateFields.workout_name = updateData.workoutName;
      if (updateData.completedAt !== undefined) updateFields.completed_at = updateData.completedAt;
      if (updateData.durationMinutes !== undefined) updateFields.duration_minutes = updateData.durationMinutes;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.energyLevel !== undefined) updateFields.energy_level = updateData.energyLevel;
      if (updateData.workoutRating !== undefined) updateFields.workout_rating = updateData.workoutRating;
      if (updateData.status !== undefined) updateFields.status = updateData.status;

      // Calculate totals from exercises if provided
      if (exercises && exercises.length > 0) {
        let totalVolume = 0;
        let totalSets = 0;
        let totalReps = 0;

        // Update or insert exercise logs
        for (const ex of exercises) {
          const setsData = ex.sets || [];
          const exTotalSets = setsData.length;
          const exTotalReps = setsData.reduce((sum, s) => sum + (s.reps || 0), 0);
          const exTotalVolume = setsData.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight || 0)), 0);
          const exMaxWeight = Math.max(...setsData.map(s => s.weight || 0), 0);

          totalVolume += exTotalVolume;
          totalSets += exTotalSets;
          totalReps += exTotalReps;

          if (ex.id) {
            // Update existing exercise log
            await supabase
              .from('exercise_logs')
              .update({
                sets_data: setsData,
                total_sets: exTotalSets,
                total_reps: exTotalReps,
                total_volume: exTotalVolume,
                max_weight: exMaxWeight,
                notes: ex.notes,
                is_pr: ex.isPr || false
              })
              .eq('id', ex.id);
          } else {
            // Insert new exercise log
            await supabase
              .from('exercise_logs')
              .insert([{
                workout_log_id: workoutId,
                exercise_id: ex.exerciseId,
                exercise_name: ex.exerciseName,
                exercise_order: ex.order || 0,
                sets_data: setsData,
                total_sets: exTotalSets,
                total_reps: exTotalReps,
                total_volume: exTotalVolume,
                max_weight: exMaxWeight,
                notes: ex.notes
              }]);
          }
        }

        updateFields.total_volume = totalVolume;
        updateFields.total_sets = totalSets;
        updateFields.total_reps = totalReps;
      }

      // Update workout log
      const { data: workout, error } = await supabase
        .from('workout_logs')
        .update(updateFields)
        .eq('id', workoutId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // DELETE - Delete a workout log
    if (event.httpMethod === 'DELETE') {
      const { workoutId } = event.queryStringParameters || {};

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      // Exercise logs will cascade delete
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', workoutId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Workout logs error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
