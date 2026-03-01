const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Generate a unique instance ID for each workout card
function generateInstanceId() {
  return 'inst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// Migrate old override formats to the new addedWorkouts format.
// Old formats (dayIndex, dayIndices, addedDayIndices) are converted to
// addedWorkouts entries with unique instance IDs, then removed.
function migrateOverride(override) {
  if (!override) return {};
  const migrated = { ...override };
  let workouts = Array.isArray(migrated.addedWorkouts) ? [...migrated.addedWorkouts] : [];
  // Track day_indices already present to avoid duplicates during conversion
  const existingDayIndices = new Set(workouts.map(w => w.day_index));

  // Convert old dayIndex (singular) → single addedWorkouts entry
  if (migrated.dayIndex !== undefined) {
    if (!existingDayIndices.has(migrated.dayIndex)) {
      workouts.push({ instance_id: generateInstanceId(), day_index: migrated.dayIndex });
      existingDayIndices.add(migrated.dayIndex);
    }
    delete migrated.dayIndex;
    migrated.isRest = true; // old dayIndex replaced the natural schedule
  }

  // Convert old dayIndices (array) → multiple addedWorkouts entries (dedup)
  if (Array.isArray(migrated.dayIndices)) {
    for (const idx of migrated.dayIndices) {
      if (!existingDayIndices.has(idx)) {
        workouts.push({ instance_id: generateInstanceId(), day_index: idx });
        existingDayIndices.add(idx);
      }
    }
    delete migrated.dayIndices;
    migrated.isRest = true; // old dayIndices replaced the natural schedule
  }

  // Convert addedDayIndices → addedWorkouts entries (dedup)
  if (Array.isArray(migrated.addedDayIndices)) {
    for (const idx of migrated.addedDayIndices) {
      if (!existingDayIndices.has(idx)) {
        workouts.push({ instance_id: generateInstanceId(), day_index: idx });
        existingDayIndices.add(idx);
      }
    }
    delete migrated.addedDayIndices;
  }

  if (workouts.length > 0) {
    migrated.addedWorkouts = workouts;
  }
  return migrated;
}

// Check if an override is empty (no data worth keeping)
function isOverrideEmpty(override) {
  if (!override) return true;
  if (override.isRest) return false;
  if (override.addedWorkouts && override.addedWorkouts.length > 0) return false;
  return true;
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
    // POST - Reschedule or duplicate a workout to another date
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, action, sourceDayIndex, targetDate, sourceDate, isAdded, instanceId } = body;

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
        // Migrate existing override to new format (cleans up old dayIndex/dayIndices/addedDayIndices)
        let override = migrateOverride(dateOverrides[targetDate]);

        if (isAdded && instanceId) {
          // Deleting a specific added instance — remove by instance_id
          if (override.addedWorkouts) {
            override.addedWorkouts = override.addedWorkouts.filter(w => w.instance_id !== instanceId);
            if (override.addedWorkouts.length === 0) delete override.addedWorkouts;
          }
        } else if (isAdded && sourceDayIndex !== undefined) {
          // Fallback: no instanceId, remove first matching day_index
          if (override.addedWorkouts) {
            const idx = override.addedWorkouts.findIndex(w => w.day_index === sourceDayIndex);
            if (idx !== -1) override.addedWorkouts.splice(idx, 1);
            if (override.addedWorkouts.length === 0) delete override.addedWorkouts;
          }
        } else {
          // Deleting a natural workout — suppress it, preserve added workouts
          override.isRest = true;
        }

        if (isOverrideEmpty(override)) {
          delete dateOverrides[targetDate];
        } else {
          dateOverrides[targetDate] = override;
        }
      } else if (action === 'reschedule' || action === 'duplicate') {
        // --- Handle SOURCE date (reschedule only) ---
        if (action === 'reschedule' && sourceDate) {
          let sourceOverride = migrateOverride(dateOverrides[sourceDate]);

          if (isAdded && instanceId) {
            // Removing a specific added instance from source
            if (sourceOverride.addedWorkouts) {
              sourceOverride.addedWorkouts = sourceOverride.addedWorkouts.filter(w => w.instance_id !== instanceId);
              if (sourceOverride.addedWorkouts.length === 0) delete sourceOverride.addedWorkouts;
            }
          } else if (isAdded && sourceDayIndex !== undefined) {
            // Fallback: remove first matching day_index from source
            if (sourceOverride.addedWorkouts) {
              const idx = sourceOverride.addedWorkouts.findIndex(w => w.day_index === sourceDayIndex);
              if (idx !== -1) sourceOverride.addedWorkouts.splice(idx, 1);
              if (sourceOverride.addedWorkouts.length === 0) delete sourceOverride.addedWorkouts;
            }
          } else {
            // Removing a natural workout from source — suppress it, preserve added workouts
            sourceOverride.isRest = true;
          }

          if (isOverrideEmpty(sourceOverride)) {
            delete dateOverrides[sourceDate];
          } else {
            dateOverrides[sourceDate] = sourceOverride;
          }
        }

        // --- Handle TARGET date: add new independent instance ---
        // Use sourceDayIndex if provided, fall back to 0 for flat-structure workouts
        const resolvedDayIndex = sourceDayIndex != null ? sourceDayIndex : 0;
        let targetOverride = migrateOverride(dateOverrides[targetDate]);
        if (!targetOverride.addedWorkouts) targetOverride.addedWorkouts = [];

        // Always create a NEW instance — never deduplicate by day_index.
        // Each move/duplicate produces its own independent workout card.
        targetOverride.addedWorkouts.push({
          instance_id: generateInstanceId(),
          day_index: resolvedDayIndex
        });

        dateOverrides[targetDate] = targetOverride;
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
