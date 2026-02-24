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
    // POST - Reschedule or duplicate a workout to another date
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, action, sourceDayIndex, targetDate, sourceDate } = body;

      if (!assignmentId || !action || !targetDate) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId, action, and targetDate are required' })
        };
      }

      if (!['reschedule', 'duplicate', 'skip'].includes(action)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'action must be reschedule, duplicate, or skip' })
        };
      }

      // Fetch the current assignment
      const { data: assignment, error: fetchError } = await supabase
        .from('client_workout_assignments')
        .select('*')
        .eq('id', assignmentId)
        .single();

      if (fetchError) {
        console.error('Error fetching assignment:', fetchError);
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Assignment not found' })
        };
      }

      const currentWorkoutData = assignment.workout_data || {};
      const dateOverrides = currentWorkoutData.date_overrides || {};

      if (action === 'skip') {
        // Mark target date as rest day
        dateOverrides[targetDate] = { isRest: true };
      } else if (action === 'reschedule') {
        // Move workout from source date to target date
        // First, determine what workout (if any) exists on the target date
        // so we can merge both days' exercises on the target date
        let targetExistingDayIndex = undefined;

        const existingTargetOverride = dateOverrides[targetDate];
        if (existingTargetOverride && existingTargetOverride.dayIndices && existingTargetOverride.dayIndices.length > 0) {
          // Target already has merged days — use first index as representative
          targetExistingDayIndex = existingTargetOverride.dayIndices[0];
        } else if (existingTargetOverride && existingTargetOverride.dayIndex !== undefined) {
          // Target date already has an override with a specific dayIndex
          targetExistingDayIndex = existingTargetOverride.dayIndex;
        } else if (!existingTargetOverride || !existingTargetOverride.isRest) {
          // No override on target date — compute the natural dayIndex from the schedule
          const days = currentWorkoutData.days || [];
          if (days.length > 0) {
            const schedule = currentWorkoutData.schedule || {};
            const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
            const startDate = assignment.start_date ? new Date(assignment.start_date) : new Date(assignment.created_at);
            const targetDateObj = new Date(targetDate);
            const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const targetDayName = dayNames[targetDateObj.getDay()];

            if (selectedDays.includes(targetDayName) && targetDateObj >= startDate) {
              // Check end boundary
              const weeksToUse = schedule.weeksAmount || 12;
              let endBoundary = null;
              if (assignment.end_date) {
                endBoundary = new Date(assignment.end_date + 'T23:59:59');
              } else {
                endBoundary = new Date(startDate);
                endBoundary.setDate(endBoundary.getDate() + (weeksToUse * 7));
              }

              if (!endBoundary || targetDateObj < endBoundary) {
                // Count workout days between start and target date
                const totalDays = Math.floor((targetDateObj - startDate) / (24 * 60 * 60 * 1000));
                const daySet = new Set(selectedDays);
                const fullWeeks = Math.floor(totalDays / 7);
                const daysPerWeek = dayNames.filter(d => daySet.has(d)).length;
                let count = fullWeeks * daysPerWeek;
                const remainderDays = totalDays % 7;
                for (let i = 0; i < remainderDays; i++) {
                  const d = new Date(startDate);
                  d.setDate(d.getDate() + (fullWeeks * 7) + i);
                  if (daySet.has(dayNames[d.getDay()])) count++;
                }
                targetExistingDayIndex = count % days.length;
              }
            }
          }
        }

        // Handle the source date — always mark as rest since we're moving away
        if (sourceDate) {
          dateOverrides[sourceDate] = { isRest: true };
        }
        // Assign the moved workout to the target date
        // If the target already has a workout, merge both days' exercises
        if (sourceDayIndex !== undefined) {
          if (targetExistingDayIndex !== undefined && targetExistingDayIndex !== sourceDayIndex) {
            // Target has a different workout — merge both day indices
            // Collect all existing dayIndices from a previous merge, if any
            const existingIndices = existingTargetOverride?.dayIndices
              ? [...existingTargetOverride.dayIndices]
              : [targetExistingDayIndex];
            // Add the incoming day if not already present
            if (!existingIndices.includes(sourceDayIndex)) {
              existingIndices.push(sourceDayIndex);
            }
            dateOverrides[targetDate] = { dayIndices: existingIndices };
          } else {
            dateOverrides[targetDate] = { dayIndex: sourceDayIndex };
          }
        }
      } else if (action === 'duplicate') {
        // Copy workout to target date (source stays as-is)
        if (sourceDayIndex !== undefined) {
          dateOverrides[targetDate] = { dayIndex: sourceDayIndex };
        }
      }

      // Save the updated workout_data with date overrides
      const updatedWorkoutData = {
        ...currentWorkoutData,
        date_overrides: dateOverrides
      };

      const { data: updatedAssignment, error: updateError } = await supabase
        .from('client_workout_assignments')
        .update({ workout_data: updatedWorkoutData })
        .eq('id', assignmentId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating assignment:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save date override' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Workout ${action}d successfully`,
          dateOverrides: updatedWorkoutData.date_overrides
        })
      };
    }

    // PUT - Update workout data for a specific assignment/day
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, dayIndex, workout_data } = body;

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      // Fetch the current assignment
      const { data: assignment, error: fetchError } = await supabase
        .from('client_workout_assignments')
        .select('*')
        .eq('id', assignmentId)
        .single();

      if (fetchError) {
        console.error('Error fetching assignment:', fetchError);
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Assignment not found' })
        };
      }

      const currentWorkoutData = assignment.workout_data || {};
      let updatedWorkoutData;

      // Handle days array structure
      if (currentWorkoutData.days && Array.isArray(currentWorkoutData.days) && dayIndex !== undefined) {
        // Update specific day in the days array
        const updatedDays = [...currentWorkoutData.days];
        const safeDayIndex = Math.abs(dayIndex) % updatedDays.length;

        // Get exercises from request - check both workout_data.exercises (flat from frontend)
        // and fall back to existing day exercises
        const incomingExercises = workout_data?.exercises || workout_data?.days?.[safeDayIndex]?.exercises;

        // Merge the new workout_data into the specific day
        updatedDays[safeDayIndex] = {
          ...updatedDays[safeDayIndex],
          exercises: incomingExercises || updatedDays[safeDayIndex].exercises
        };

        updatedWorkoutData = {
          ...currentWorkoutData,
          days: updatedDays
        };

        console.log(`[client-workout-log] Updated day ${safeDayIndex} exercises: ${(incomingExercises || []).length} exercises, completed: ${(incomingExercises || []).filter(e => e?.completed).length}`);
      } else {
        // Flat structure - update exercises directly
        updatedWorkoutData = {
          ...currentWorkoutData,
          exercises: workout_data.exercises || currentWorkoutData.exercises
        };
      }

      // Save the updated workout_data
      const { data: updatedAssignment, error: updateError } = await supabase
        .from('client_workout_assignments')
        .update({ workout_data: updatedWorkoutData })
        .eq('id', assignmentId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating assignment:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save workout changes' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment: updatedAssignment })
      };
    }

    // GET - Fetch workout log/data for a client for a specific date
    if (event.httpMethod === 'GET') {
      const { clientId, date } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      // Get the active assignment for this client
      const { data: assignment, error: assignmentError } = await supabase
        .from('client_workout_assignments')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .single();

      if (assignmentError && assignmentError.code !== 'PGRST116') {
        throw assignmentError;
      }

      if (!assignment) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ log: null })
        };
      }

      // If date provided, calculate day index
      if (date) {
        const workoutData = assignment.workout_data || {};
        const days = workoutData.days || [];
        const schedule = workoutData.schedule || {};
        const startDate = assignment.start_date ? new Date(assignment.start_date) : new Date(assignment.created_at);
        const targetDate = new Date(date);

        const targetDayOfWeek = targetDate.getDay();
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const targetDayName = dayNames[targetDayOfWeek];
        const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

        let dayIndex = 0;
        let isWorkoutDay = selectedDays.includes(targetDayName);

        // Check if target date is before the assignment start date
        if (targetDate < startDate) {
          isWorkoutDay = false;
        }

        // Check if target date is after the assignment end date
        if (isWorkoutDay) {
          const weeksToUse = schedule.weeksAmount || 12; // Default to 12 weeks if not set
          let endBoundary = null;
          if (assignment.end_date) {
            endBoundary = new Date(assignment.end_date + 'T23:59:59');
          } else {
            endBoundary = new Date(startDate);
            endBoundary.setDate(endBoundary.getDate() + (weeksToUse * 7));
          }
          if (endBoundary && targetDate >= endBoundary) {
            isWorkoutDay = false;
          }
        }

        if (isWorkoutDay && days.length > 0) {
          let workoutDayCount = 0;
          const tempDate = new Date(startDate);

          while (tempDate < targetDate) {
            const tempDayName = dayNames[tempDate.getDay()];
            if (selectedDays.includes(tempDayName)) {
              workoutDayCount++;
            }
            tempDate.setDate(tempDate.getDate() + 1);
          }

          dayIndex = workoutDayCount % days.length;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            log: {
              assignmentId: assignment.id,
              dayIndex,
              isWorkoutDay,
              workout_data: days.length > 0 ? days[dayIndex] : workoutData
            }
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          log: {
            assignmentId: assignment.id,
            workout_data: assignment.workout_data
          }
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Client workout log error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
