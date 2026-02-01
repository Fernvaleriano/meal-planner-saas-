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

      const { date } = event.queryStringParameters || {};

      let query = supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('workout_date', { ascending: false })
        .limit(parseInt(limit));

      // Support single date filter (exact match)
      if (date) {
        query = query.eq('workout_date', date);
      }
      if (startDate) {
        query = query.gte('workout_date', startDate);
      }
      if (endDate) {
        query = query.lte('workout_date', endDate);
      }

      const { data: workouts, error } = await query;

      if (error) throw error;

      // Fetch exercise_logs for each workout so client-side gets notes, sets, etc.
      const workoutsWithExercises = await Promise.all(
        (workouts || []).map(async (w) => {
          const { data: exercises } = await supabase
            .from('exercise_logs')
            .select('*')
            .eq('workout_log_id', w.id)
            .order('exercise_order', { ascending: true });
          return { ...w, exercises: exercises || [] };
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          workouts: workoutsWithExercises,
          logs: workoutsWithExercises  // alias for backward compat with Workouts.jsx
        })
      };
    }

    // POST - Create/start a workout log (idempotent: returns existing if one exists for same client+date)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        coachId,
        assignmentId,
        workoutDate,
        workoutName,
        exercises, // Array of exercise data
        timezone,
        energyLevel,
        sorenessLevel,
        sleepQuality
      } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const resolvedDate = getDefaultDate(workoutDate, timezone);

      // Check if a workout log already exists for this client + date
      const { data: existingLogs } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .eq('workout_date', resolvedDate)
        .limit(1);

      if (existingLogs && existingLogs.length > 0) {
        // Return existing log instead of creating a duplicate
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, workout: existingLogs[0] })
        };
      }

      // Create workout log
      const insertData = {
        client_id: clientId,
        coach_id: coachId,
        workout_date: resolvedDate,
        workout_name: workoutName,
        started_at: new Date().toISOString(),
        status: 'in_progress'
      };
      if (assignmentId) insertData.assignment_id = assignmentId;
      if (energyLevel) insertData.energy_level = energyLevel;
      if (sorenessLevel) insertData.soreness_level = sorenessLevel;
      if (sleepQuality) insertData.sleep_quality = sleepQuality;

      const { data: workout, error: workoutError } = await supabase
        .from('workout_logs')
        .insert([insertData])
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

      // Get the workout log to find client_id and coach_id for PR notifications
      const { data: workoutLogData } = await supabase
        .from('workout_logs')
        .select('client_id, coach_id')
        .eq('id', workoutId)
        .single();

      const prNotifications = []; // Collect PRs to notify coach

      // Build workout update fields
      const updateFields = {};
      if (updateData.workoutName !== undefined) updateFields.workout_name = updateData.workoutName;
      if (updateData.completedAt !== undefined) updateFields.completed_at = updateData.completedAt;
      if (updateData.durationMinutes !== undefined) updateFields.duration_minutes = updateData.durationMinutes;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.energyLevel !== undefined) updateFields.energy_level = updateData.energyLevel;
      if (updateData.sorenessLevel !== undefined) updateFields.soreness_level = updateData.sorenessLevel;
      if (updateData.sleepQuality !== undefined) updateFields.sleep_quality = updateData.sleepQuality;
      if (updateData.workoutRating !== undefined) updateFields.workout_rating = updateData.workoutRating;
      if (updateData.status !== undefined) updateFields.status = updateData.status;

      // Calculate totals from exercises if provided
      if (exercises && exercises.length > 0) {
        let totalVolume = 0;
        let totalSets = 0;
        let totalReps = 0;

        // Pre-fetch all data needed for PR detection in batch (instead of per-exercise)
        let previousBestMap = {}; // exerciseName -> max_weight
        const exerciseNames = exercises.filter(ex => ex.exerciseName).map(ex => ex.exerciseName);

        if (workoutLogData?.client_id && exerciseNames.length > 0) {
          try {
            // Single query: get previous best weight for all exercises at once
            const { data: previousBests } = await supabase
              .from('exercise_logs')
              .select('exercise_name, max_weight, workout_log_id')
              .eq('workout_log_id', workoutId)
              .in('exercise_name', exerciseNames);

            // Get all previous exercise logs (not from this workout) in one query
            const { data: allPrevLogs } = await supabase
              .from('exercise_logs')
              .select('exercise_name, max_weight')
              .in('exercise_name', exerciseNames)
              .neq('workout_log_id', workoutId)
              .order('max_weight', { ascending: false });

            // Build map of exercise_name -> best previous weight
            for (const name of exerciseNames) {
              const prevLogs = (allPrevLogs || []).filter(l => l.exercise_name === name);
              previousBestMap[name] = prevLogs.length > 0 ? prevLogs[0].max_weight : 0;
            }
          } catch (prBatchError) {
            console.warn('Batch PR lookup failed:', prBatchError.message);
            // Continue without PR detection
          }
        }

        // Pre-fetch existing exercise logs for this workout in batch
        let existingLogMap = {}; // exerciseId -> log id
        try {
          const { data: existingLogs } = await supabase
            .from('exercise_logs')
            .select('id, exercise_id')
            .eq('workout_log_id', workoutId);

          for (const log of (existingLogs || [])) {
            if (log.exercise_id) existingLogMap[log.exercise_id] = log.id;
          }
        } catch (e) {
          // Continue - will insert new logs
        }

        // Process exercises (now with minimal DB calls)
        for (const ex of exercises) {
          const setsData = ex.sets || [];
          const exTotalSets = setsData.length;
          const exTotalReps = setsData.reduce((sum, s) => sum + (s.reps || 0), 0);
          const exTotalVolume = setsData.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight || 0)), 0);
          const exMaxWeight = Math.max(...setsData.map(s => s.weight || 0), 0);

          totalVolume += exTotalVolume;
          totalSets += exTotalSets;
          totalReps += exTotalReps;

          // PR Detection using pre-fetched data
          let isPr = ex.isPr || false;
          if (exMaxWeight > 0 && ex.exerciseName && previousBestMap.hasOwnProperty(ex.exerciseName)) {
            const previousBestWeight = previousBestMap[ex.exerciseName] || 0;
            if (exMaxWeight > previousBestWeight) {
              isPr = true;
              const bestRepsAtWeight = setsData.find(s => s.weight === exMaxWeight)?.reps || 0;
              prNotifications.push({
                exerciseName: ex.exerciseName,
                weight: exMaxWeight,
                reps: bestRepsAtWeight,
                unit: setsData.find(s => s.weight === exMaxWeight)?.weightUnit || 'lbs',
                previousBest: previousBestWeight > 0 ? previousBestWeight : null
              });
            }
          }

          // Check if exercise_log already exists using pre-fetched map
          const existingId = ex.id || (ex.exerciseId ? existingLogMap[ex.exerciseId] : null);

          if (existingId) {
            // Update existing exercise log
            const updateObj = {
              sets_data: setsData,
              total_sets: exTotalSets,
              total_reps: exTotalReps,
              total_volume: exTotalVolume,
              max_weight: exMaxWeight,
              exercise_name: ex.exerciseName || undefined,
              exercise_order: ex.order || undefined,
              notes: ex.notes,
              is_pr: isPr
            };
            if (ex.clientNotes !== undefined) updateObj.client_notes = ex.clientNotes;
            if (ex.clientVoiceNotePath !== undefined) updateObj.client_voice_note_path = ex.clientVoiceNotePath;
            await supabase
              .from('exercise_logs')
              .update(updateObj)
              .eq('id', existingId);
          } else {
            // Insert new exercise log
            const insertObj = {
              workout_log_id: workoutId,
              exercise_id: ex.exerciseId,
              exercise_name: ex.exerciseName,
              exercise_order: ex.order || 0,
              sets_data: setsData,
              total_sets: exTotalSets,
              total_reps: exTotalReps,
              total_volume: exTotalVolume,
              max_weight: exMaxWeight,
              notes: ex.notes,
              is_pr: isPr
            };
            if (ex.clientNotes) insertObj.client_notes = ex.clientNotes;
            if (ex.clientVoiceNotePath) insertObj.client_voice_note_path = ex.clientVoiceNotePath;
            await supabase
              .from('exercise_logs')
              .insert([insertObj]);
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

      // Send PR notifications to coach (non-blocking)
      if (prNotifications.length > 0 && workoutLogData?.coach_id && workoutLogData?.client_id) {
        try {
          // Get client name for notification
          const { data: clientData } = await supabase
            .from('clients')
            .select('client_name, coach_id')
            .eq('id', workoutLogData.client_id)
            .single();

          if (clientData) {
            // Get coach's user_id for the notification
            const coachUserId = workoutLogData.coach_id;

            for (const pr of prNotifications) {
              const prTitle = `New PR: ${clientData.client_name} - ${pr.exerciseName}`;
              const prMessage = pr.previousBest
                ? `${clientData.client_name} just hit a new personal record on ${pr.exerciseName}: ${pr.weight}${pr.unit} x${pr.reps} (previous best: ${pr.previousBest}${pr.unit})`
                : `${clientData.client_name} just logged their first ${pr.exerciseName}: ${pr.weight}${pr.unit} x${pr.reps}`;

              await supabase
                .from('notifications')
                .insert([{
                  user_id: coachUserId,
                  type: 'client_pr',
                  title: prTitle,
                  message: prMessage,
                  related_client_id: workoutLogData.client_id
                }]);
            }
          }
        } catch (notifError) {
          console.warn('Failed to send PR notification:', notifError.message);
          // Non-critical, don't fail the workout save
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout, prs: prNotifications })
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
