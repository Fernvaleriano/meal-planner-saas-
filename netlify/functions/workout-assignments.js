const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Helper function to enrich exercises with fresh video URLs from the database
// Workout snapshots may have been created before video_url was set on the exercise
async function enrichExercisesWithVideos(exercises, supabase) {
  if (!exercises || exercises.length === 0) return exercises;

  // Collect all exercise IDs (we always want the latest video URLs)
  const exerciseIds = exercises
    .filter(ex => ex.id && typeof ex.id === 'number')
    .map(ex => ex.id);

  if (exerciseIds.length === 0) return exercises;

  const { data: exerciseData, error } = await supabase
    .from('exercises')
    .select('id, video_url, animation_url, thumbnail_url')
    .in('id', exerciseIds);

  if (error || !exerciseData) {
    console.error('Error fetching video data:', error);
    return exercises;
  }

  const videoMap = new Map(exerciseData.map(ex => [ex.id, ex]));

  return exercises.map(ex => {
    if (!ex.id || !videoMap.has(ex.id)) return ex;
    const fresh = videoMap.get(ex.id);
    const updates = {};
    // Only overwrite if the DB has a value and the snapshot doesn't
    if (fresh.video_url && !ex.video_url) updates.video_url = fresh.video_url;
    if (fresh.animation_url && !ex.animation_url) updates.animation_url = fresh.animation_url;
    if (fresh.thumbnail_url && !ex.thumbnail_url) updates.thumbnail_url = fresh.thumbnail_url;
    if (Object.keys(updates).length === 0) return ex;
    return { ...ex, ...updates };
  });
}

// Helper function to enrich exercises with equipment data from the database
// This fixes legacy workouts that may have exercises without equipment info
async function enrichExercisesWithEquipment(exercises, supabase) {
  if (!exercises || exercises.length === 0) return exercises;

  // Collect exercise IDs that are missing equipment
  const exerciseIds = exercises
    .filter(ex => ex.id && !ex.equipment)
    .map(ex => ex.id);

  if (exerciseIds.length === 0) return exercises;

  // Fetch equipment data for these exercises
  const { data: exerciseData, error } = await supabase
    .from('exercises')
    .select('id, equipment')
    .in('id', exerciseIds);

  if (error || !exerciseData) {
    console.error('Error fetching equipment data:', error);
    return exercises;
  }

  // Create a map of id -> equipment
  const equipmentMap = new Map(exerciseData.map(ex => [ex.id, ex.equipment]));

  // Enrich exercises with equipment data
  return exercises.map(ex => {
    if (ex.id && !ex.equipment && equipmentMap.has(ex.id)) {
      return { ...ex, equipment: equipmentMap.get(ex.id) };
    }
    return ex;
  });
}

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
    // GET - Fetch workout assignments
    if (event.httpMethod === 'GET') {
      const { clientId, coachId, assignmentId, activeOnly, date } = event.queryStringParameters || {};

      // Get single assignment by ID
      if (assignmentId) {
        const { data: assignment, error } = await supabase
          .from('client_workout_assignments')
          .select('*')
          .eq('id', assignmentId)
          .single();

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ assignment })
        };
      }

      // Get assignments for a client
      if (clientId) {
        // If date is provided, get workouts for that date from all active assignments
        if (date) {
          // Get all active assignments for this client
          const { data: activeAssignments, error: assignmentError } = await supabase
            .from('client_workout_assignments')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (assignmentError) {
            console.error('Error fetching active assignments:', assignmentError);
            throw assignmentError;
          }

          if (!activeAssignments || activeAssignments.length === 0) {
            // Check for ad-hoc workouts created by the client on this date
            try {
              const { data: adhocWorkout } = await supabase
                .from('client_adhoc_workouts')
                .select('*')
                .eq('client_id', clientId)
                .eq('workout_date', date)
                .eq('is_active', true)
                .maybeSingle();

              if (adhocWorkout) {
                // Enrich ad-hoc workout exercises with video URLs
                const adhocData = adhocWorkout.workout_data || {};
                if (adhocData.exercises) {
                  adhocData.exercises = await enrichExercisesWithVideos(adhocData.exercises, supabase);
                }
                // Return the ad-hoc workout as an assignment
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    assignments: [{
                      id: adhocWorkout.id,
                      name: adhocWorkout.name || 'Custom Workout',
                      day_index: 0,
                      workout_data: adhocData,
                      client_id: clientId,
                      is_adhoc: true
                    }]
                  })
                };
              }
            } catch (adhocError) {
              // Ad-hoc table might not exist, ignore
              console.log('Adhoc lookup skipped:', adhocError.message);
            }

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ assignments: [] })
            };
          }

          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const targetDate = new Date(date);
          const targetDayOfWeek = targetDate.getDay();
          const targetDayName = dayNames[targetDayOfWeek];

          // Process each active assignment to find workouts for this date
          const todayWorkouts = [];

          for (const activeAssignment of activeAssignments) {
            const workoutData = activeAssignment.workout_data || {};
            const days = workoutData.days || [];
            const schedule = workoutData.schedule || activeAssignment.schedule || {};
            const startDate = activeAssignment.start_date ? new Date(activeAssignment.start_date) : new Date(activeAssignment.created_at);

            // Resolve image_url: use assignment's image, or fall back to program's image
            let resolvedImageUrl = workoutData.image_url || null;
            if (!resolvedImageUrl && activeAssignment.program_id) {
              try {
                const { data: programData } = await supabase
                  .from('workout_programs')
                  .select('program_data')
                  .eq('id', activeAssignment.program_id)
                  .single();
                resolvedImageUrl = programData?.program_data?.image_url || null;
              } catch (e) {
                // Ignore - program may have been deleted
              }
            }

            const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

            // Check for date overrides (reschedule/duplicate/skip)
            const dateOverrides = workoutData.date_overrides || {};
            const dateKey = date;
            const override = dateOverrides[dateKey];

            let todayWorkout = null;

            // If there's an override for this date, use it
            if (override) {
              if (override.isRest) {
                // This assignment is a rest day on this date, skip it
                continue;
              }

              if (override.dayIndex !== undefined && days.length > 0) {
                const dayIndex = override.dayIndex % days.length;
                let enrichedExercises = await enrichExercisesWithEquipment(
                  days[dayIndex].exercises || [],
                  supabase
                );
                enrichedExercises = await enrichExercisesWithVideos(enrichedExercises, supabase);

                todayWorkout = {
                  id: activeAssignment.id,
                  name: days[dayIndex].name || `Day ${dayIndex + 1}`,
                  day_index: dayIndex,
                  workout_data: {
                    ...days[dayIndex],
                    exercises: enrichedExercises,
                    estimatedMinutes: days[dayIndex].estimatedMinutes || 45,
                    estimatedCalories: days[dayIndex].estimatedCalories || 300,
                    image_url: resolvedImageUrl
                  },
                  program_id: activeAssignment.program_id,
                  client_id: activeAssignment.client_id,
                  is_override: true
                };
                todayWorkouts.push(todayWorkout);
                continue;
              }
            }

            if (days.length > 0) {
              const isWorkoutDay = selectedDays.includes(targetDayName);

              if (isWorkoutDay) {
                let workoutDayCount = 0;
                const tempDate = new Date(startDate);

                let loopCount = 0;
                const maxLoops = 365;

                while (tempDate < targetDate && loopCount < maxLoops) {
                  const tempDayName = dayNames[tempDate.getDay()];
                  if (selectedDays.includes(tempDayName)) {
                    workoutDayCount++;
                  }
                  tempDate.setDate(tempDate.getDate() + 1);
                  loopCount++;
                }

                const dayIndex = workoutDayCount % days.length;

                todayWorkout = {
                  id: activeAssignment.id,
                  name: days[dayIndex].name || `Day ${dayIndex + 1}`,
                  day_index: dayIndex,
                  workout_data: {
                    ...days[dayIndex],
                    exercises: days[dayIndex].exercises || [],
                    estimatedMinutes: days[dayIndex].estimatedMinutes || 45,
                    estimatedCalories: days[dayIndex].estimatedCalories || 300,
                    image_url: resolvedImageUrl
                  },
                  program_id: activeAssignment.program_id,
                  client_id: activeAssignment.client_id
                };
              }
            } else if (workoutData.exercises) {
              todayWorkout = {
                id: activeAssignment.id,
                name: activeAssignment.name || 'Today\'s Workout',
                workout_data: {
                  exercises: workoutData.exercises,
                  estimatedMinutes: 45,
                  estimatedCalories: 300,
                  image_url: resolvedImageUrl
                },
                program_id: activeAssignment.program_id,
                client_id: activeAssignment.client_id
              };
            }

            // Enrich exercises with equipment and video data if missing
            if (todayWorkout?.workout_data?.exercises) {
              todayWorkout.workout_data.exercises = await enrichExercisesWithEquipment(
                todayWorkout.workout_data.exercises,
                supabase
              );
              todayWorkout.workout_data.exercises = await enrichExercisesWithVideos(
                todayWorkout.workout_data.exercises,
                supabase
              );
            }

            if (todayWorkout) {
              todayWorkouts.push(todayWorkout);
            }
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              assignments: todayWorkouts
            })
          };
        }

        // No date - return all assignments
        let query = supabase
          .from('client_workout_assignments')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (activeOnly === 'true') {
          query = query.eq('is_active', true);
        }

        const { data: assignments, error } = await query;

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ assignments: assignments || [] })
        };
      }

      // Get all assignments for a coach
      if (coachId) {
        const { data: assignments, error } = await supabase
          .from('client_workout_assignments')
          .select(`
            *,
            clients!inner(id, client_name, email)
          `)
          .eq('coach_id', coachId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ assignments: assignments || [] })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId, coachId, or assignmentId required' })
      };
    }

    // POST - Create/assign a workout program to a client
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        coachId,
        programId,
        name,
        startDate,
        endDate,
        workoutData,
        schedule
      } = body;

      if (!clientId || !coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId and coachId are required' })
        };
      }

      let finalWorkoutData = workoutData;
      let finalName = name;

      // If programId provided, copy program data
      if (programId) {
        const { data: program, error: programError } = await supabase
          .from('workout_programs')
          .select('*')
          .eq('id', programId)
          .single();

        if (programError) throw programError;

        finalWorkoutData = finalWorkoutData || program.program_data;
        finalName = finalName || program.name;
      }

      // Store schedule in workout_data to avoid needing a new column
      const workoutDataWithSchedule = {
        ...finalWorkoutData,
        schedule: schedule || { selectedDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }
      };

      // Create new assignment
      const { data: assignment, error } = await supabase
        .from('client_workout_assignments')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          program_id: programId,
          name: finalName || 'Custom Workout Plan',
          start_date: startDate || schedule?.startDate,
          end_date: endDate,
          workout_data: workoutDataWithSchedule,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment })
      };
    }

    // PUT - Update an assignment
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, ...updateData } = body;

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      // Map camelCase to snake_case
      const updateFields = {};
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.startDate !== undefined) updateFields.start_date = updateData.startDate;
      if (updateData.endDate !== undefined) updateFields.end_date = updateData.endDate;
      if (updateData.workoutData !== undefined) updateFields.workout_data = updateData.workoutData;
      if (updateData.isActive !== undefined) updateFields.is_active = updateData.isActive;

      const { data: assignment, error } = await supabase
        .from('client_workout_assignments')
        .update(updateFields)
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment })
      };
    }

    // DELETE - Remove an assignment
    if (event.httpMethod === 'DELETE') {
      const { assignmentId } = event.queryStringParameters || {};

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      const { error } = await supabase
        .from('client_workout_assignments')
        .delete()
        .eq('id', assignmentId);

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
    console.error('Workout assignments error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
