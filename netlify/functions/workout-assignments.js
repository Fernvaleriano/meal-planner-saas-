const { createClient } = require('@supabase/supabase-js');

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
        // If date is provided, get the specific workout for that date
        if (date) {
          // First get the active assignment - use maybeSingle to avoid errors when no assignment exists
          const { data: activeAssignment, error: assignmentError } = await supabase
            .from('client_workout_assignments')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .maybeSingle();

          if (assignmentError && assignmentError.code !== 'PGRST116') {
            console.error('Error fetching active assignment:', assignmentError);
            throw assignmentError;
          }

          if (!activeAssignment) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ assignments: [] })
            };
          }

          // Calculate which day of the program this date corresponds to
          const workoutData = activeAssignment.workout_data || {};
          const days = workoutData.days || [];
          const schedule = workoutData.schedule || activeAssignment.schedule || {};
          const startDate = activeAssignment.start_date ? new Date(activeAssignment.start_date) : new Date(activeAssignment.created_at);
          const targetDate = new Date(date);

          // Get day of week (0=Sunday, 6=Saturday)
          const targetDayOfWeek = targetDate.getDay();
          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const targetDayName = dayNames[targetDayOfWeek];

          // Check if this day is in the selected days (if schedule exists)
          const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

          // Check for date overrides (reschedule/duplicate/skip)
          const dateOverrides = workoutData.date_overrides || {};
          const dateKey = date; // Date string like "2025-12-28"
          const override = dateOverrides[dateKey];

          let todayWorkout = null;

          // If there's an override for this date, use it
          if (override) {
            if (override.isRest) {
              // This date was marked as rest day
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ assignments: [] })
              };
            }

            if (override.dayIndex !== undefined && days.length > 0) {
              // Use the overridden day index
              const dayIndex = override.dayIndex % days.length;
              todayWorkout = {
                id: activeAssignment.id,
                name: days[dayIndex].name || `Day ${dayIndex + 1}`,
                day_index: dayIndex,
                workout_data: {
                  ...days[dayIndex],
                  exercises: days[dayIndex].exercises || [],
                  estimatedMinutes: days[dayIndex].estimatedMinutes || 45,
                  estimatedCalories: days[dayIndex].estimatedCalories || 300,
                  image_url: workoutData.image_url || null
                },
                program_id: activeAssignment.program_id,
                client_id: activeAssignment.client_id,
                is_override: true
              };

              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  assignments: [todayWorkout]
                })
              };
            }
          }

          if (days.length > 0) {
            // Check if this day of week is a workout day
            const isWorkoutDay = selectedDays.includes(targetDayName);

            if (isWorkoutDay) {
              // Calculate which workout day this is
              // Count workout days from start date to target date
              let workoutDayCount = 0;
              const tempDate = new Date(startDate);

              // Safety limit: max 365 days to prevent infinite loops
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

              // Cycle through program days
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
                  image_url: workoutData.image_url || null
                },
                program_id: activeAssignment.program_id,
                client_id: activeAssignment.client_id
              };
            }
          } else if (workoutData.exercises) {
            // Fallback: use flat exercises list (for legacy data)
            todayWorkout = {
              id: activeAssignment.id,
              name: activeAssignment.name || 'Today\'s Workout',
              workout_data: {
                exercises: workoutData.exercises,
                estimatedMinutes: 45,
                estimatedCalories: 300,
                image_url: workoutData.image_url || null
              },
              program_id: activeAssignment.program_id,
              client_id: activeAssignment.client_id
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              assignments: todayWorkout ? [todayWorkout] : []
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

      // Deactivate any existing active assignments for this client
      await supabase
        .from('client_workout_assignments')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('is_active', true);

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
