const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
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
    // Always prefer the DB thumbnail (coach may have updated it after snapshot)
    if (fresh.thumbnail_url && fresh.thumbnail_url !== ex.thumbnail_url) updates.thumbnail_url = fresh.thumbnail_url;
    // Only overwrite video/animation if the DB has a value and the snapshot doesn't
    if (fresh.video_url && !ex.video_url) updates.video_url = fresh.video_url;
    if (fresh.animation_url && !ex.animation_url) updates.animation_url = fresh.animation_url;
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

          // Batch-fetch program images for assignments that need them (single query instead of N)
          const programIdsNeeded = activeAssignments
            .filter(a => !(a.workout_data?.image_url) && a.program_id)
            .map(a => a.program_id);
          const programImageMap = new Map();
          if (programIdsNeeded.length > 0) {
            try {
              const { data: programs } = await supabase
                .from('workout_programs')
                .select('id, program_data')
                .in('id', [...new Set(programIdsNeeded)]);
              if (programs) {
                programs.forEach(p => {
                  programImageMap.set(p.id, p.program_data?.image_url || null);
                });
              }
            } catch (e) {
              // Ignore - programs may have been deleted
            }
          }

          // Helper: count workout days between two dates using math instead of day-by-day loop
          function countWorkoutDays(startDate, targetDate, selectedDays) {
            const daySet = new Set(selectedDays);
            const start = new Date(startDate);
            const target = new Date(targetDate);
            const totalDays = Math.floor((target - start) / (24 * 60 * 60 * 1000));
            if (totalDays <= 0) return 0;

            const fullWeeks = Math.floor(totalDays / 7);
            const daysPerWeek = dayNames.filter(d => daySet.has(d)).length;
            let count = fullWeeks * daysPerWeek;

            // Count remaining partial week days
            const remainderDays = totalDays % 7;
            for (let i = 0; i < remainderDays; i++) {
              const d = new Date(start);
              d.setDate(d.getDate() + (fullWeeks * 7) + i);
              if (daySet.has(dayNames[d.getDay()])) {
                count++;
              }
            }
            return count;
          }

          // Process each active assignment to find workouts for this date
          const todayWorkouts = [];

          for (const activeAssignment of activeAssignments) {
            const workoutData = activeAssignment.workout_data || {};
            const days = workoutData.days || [];
            const schedule = workoutData.schedule || activeAssignment.schedule || {};
            const startDate = activeAssignment.start_date ? new Date(activeAssignment.start_date) : new Date(activeAssignment.created_at);

            // Resolve image_url: use assignment's image, or fall back to pre-fetched program image
            const resolvedImageUrl = workoutData.image_url || programImageMap.get(activeAssignment.program_id) || null;

            const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

            // Compute assignment end date boundary (default 12 weeks if not set)
            const weeksToUse = schedule.weeksAmount || 12;
            let endBoundary = null;
            if (activeAssignment.end_date) {
              endBoundary = new Date(activeAssignment.end_date + 'T23:59:59');
            } else {
              endBoundary = new Date(startDate);
              endBoundary.setDate(endBoundary.getDate() + (weeksToUse * 7));
            }

            // Skip if target date is before start date or after end date
            if (targetDate < startDate) continue;
            if (endBoundary && targetDate >= endBoundary) continue;

            // Check for date overrides (reschedule/duplicate/skip)
            const dateOverrides = workoutData.date_overrides || {};
            const dateKey = date;
            const override = dateOverrides[dateKey];

            let todayWorkout = null;
            let skipNatural = false;

            // Compute natural day index upfront (needed for dedup against addedDayIndices)
            let naturalDayIndex = undefined;
            if (days.length > 0 && selectedDays.includes(targetDayName)) {
              const workoutDayCount = countWorkoutDays(startDate, targetDate, selectedDays);
              naturalDayIndex = workoutDayCount % days.length;
            }

            // If there's an override for this date, process it
            if (override && days.length > 0) {
              // isRest suppresses the natural workout
              if (override.isRest) {
                skipNatural = true;
              }

              // Collect all added workout instances from ALL formats (backwards compat + new)
              const addedInstances = [];

              // New format: addedWorkouts (each has its own instance_id)
              if (Array.isArray(override.addedWorkouts)) {
                for (const aw of override.addedWorkouts) {
                  addedInstances.push({
                    instance_id: aw.instance_id,
                    day_index: aw.day_index
                  });
                }
              }

              // Backwards compat: old dayIndices → treat as added instances, suppress natural
              if (Array.isArray(override.dayIndices)) {
                for (let i = 0; i < override.dayIndices.length; i++) {
                  addedInstances.push({
                    instance_id: `${activeAssignment.id}-legacy-di-${i}`,
                    day_index: override.dayIndices[i]
                  });
                }
                skipNatural = true;
              }

              // Backwards compat: old dayIndex → treat as single added instance, suppress natural
              if (override.dayIndex !== undefined) {
                addedInstances.push({
                  instance_id: `${activeAssignment.id}-legacy-dx`,
                  day_index: override.dayIndex
                });
                skipNatural = true;
              }

              // Backwards compat: old addedDayIndices → treat as added instances (no suppress)
              if (Array.isArray(override.addedDayIndices)) {
                for (let i = 0; i < override.addedDayIndices.length; i++) {
                  addedInstances.push({
                    instance_id: `${activeAssignment.id}-legacy-adi-${i}`,
                    day_index: override.addedDayIndices[i]
                  });
                }
              }

              // Create a card for each added instance
              for (const inst of addedInstances) {
                const di = inst.day_index % days.length;
                // Dedup: if natural schedule is active and this matches it, skip (natural handles it)
                if (!skipNatural && naturalDayIndex !== undefined && di === naturalDayIndex) continue;
                const day = days[di];
                if (day) {
                  todayWorkouts.push({
                    id: activeAssignment.id,
                    instance_id: inst.instance_id,
                    name: activeAssignment.name || day.name || `Day ${di + 1}`,
                    day_index: di,
                    workout_data: {
                      ...day,
                      exercises: (day.exercises || []).map(ex => ({ ...ex })),
                      estimatedMinutes: day.estimatedMinutes || 45,
                      estimatedCalories: day.estimatedCalories || 300,
                      image_url: resolvedImageUrl
                    },
                    program_id: activeAssignment.program_id,
                    client_id: activeAssignment.client_id,
                    is_override: true,
                    is_added: true
                  });
                }
              }
            }

            // Natural schedule (unless suppressed by isRest or old-style overrides)
            if (!skipNatural && days.length > 0) {
              const isWorkoutDay = selectedDays.includes(targetDayName);

              if (isWorkoutDay) {
                const natDay = days[naturalDayIndex];
                todayWorkout = {
                  id: activeAssignment.id,
                  instance_id: `${activeAssignment.id}-natural`,
                  name: activeAssignment.name || natDay.name || `Day ${naturalDayIndex + 1}`,
                  day_index: naturalDayIndex,
                  workout_data: {
                    ...natDay,
                    exercises: (natDay.exercises || []).map(ex => ({ ...ex })),
                    estimatedMinutes: natDay.estimatedMinutes || 45,
                    estimatedCalories: natDay.estimatedCalories || 300,
                    image_url: resolvedImageUrl
                  },
                  program_id: activeAssignment.program_id,
                  client_id: activeAssignment.client_id
                };
              }
            } else if (!skipNatural && workoutData.exercises) {
              todayWorkout = {
                id: activeAssignment.id,
                instance_id: `${activeAssignment.id}-natural`,
                name: activeAssignment.name || 'Today\'s Workout',
                workout_data: {
                  exercises: (workoutData.exercises || []).map(ex => ({ ...ex })),
                  estimatedMinutes: 45,
                  estimatedCalories: 300,
                  image_url: resolvedImageUrl
                },
                program_id: activeAssignment.program_id,
                client_id: activeAssignment.client_id
              };
            }

            if (todayWorkout) {
              todayWorkouts.push(todayWorkout);
            }
          }

          // Batch-enrich all exercises across all workouts with a single DB query each
          // Collect all exercise IDs from all workouts
          const allExerciseIds = new Set();
          for (const w of todayWorkouts) {
            const exercises = w.workout_data?.exercises || [];
            exercises.forEach(ex => {
              if (ex.id && typeof ex.id === 'number') allExerciseIds.add(ex.id);
            });
          }

          if (allExerciseIds.size > 0) {
            // Single query for both equipment and video data
            const { data: exerciseData } = await supabase
              .from('exercises')
              .select('id, equipment, video_url, animation_url, thumbnail_url')
              .in('id', [...allExerciseIds]);

            if (exerciseData) {
              const exerciseMap = new Map(exerciseData.map(ex => [ex.id, ex]));

              // Apply enrichment to all workouts
              for (const w of todayWorkouts) {
                if (w.workout_data?.exercises) {
                  w.workout_data.exercises = w.workout_data.exercises.map(ex => {
                    if (!ex.id || !exerciseMap.has(ex.id)) return ex;
                    const fresh = exerciseMap.get(ex.id);
                    const updates = {};
                    if (!ex.equipment && fresh.equipment) updates.equipment = fresh.equipment;
                    if (fresh.thumbnail_url && fresh.thumbnail_url !== ex.thumbnail_url) updates.thumbnail_url = fresh.thumbnail_url;
                    if (fresh.video_url && !ex.video_url) updates.video_url = fresh.video_url;
                    if (fresh.animation_url && !ex.animation_url) updates.animation_url = fresh.animation_url;
                    if (Object.keys(updates).length === 0) return ex;
                    return { ...ex, ...updates };
                  });
                }
              }
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

      // Create a notification for the client
      try {
        const programName = finalName || 'New Workout Program';
        await supabase
          .from('notifications')
          .insert([{
            client_id: clientId,
            type: 'workout_assigned',
            title: 'New Workout Program Assigned',
            message: `Your coach has assigned "${programName}" to you.`,
            metadata: {
              assignment_id: assignment.id,
              program_id: programId || null,
              program_name: programName
            }
          }]);
        console.log('🔔 Notification sent to client', clientId);
      } catch (notifError) {
        // Don't fail the assignment if notification fails
        console.error('⚠️ Failed to send notification:', notifError);
      }

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
