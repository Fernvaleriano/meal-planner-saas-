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

      // Read-modify-write under optimistic concurrency: re-read, rebuild,
      // and conditionally update. If another concurrent request updated the
      // same row between our read and write, the compare-and-swap on
      // updated_at fails and we retry. Without this, two rapid deletes
      // clobber each other and previously-deleted workouts reappear.
      const MAX_ATTEMPTS = 6;
      let finalDateOverrides = null;
      let attempt = 0;
      let lastError = null;

      while (attempt < MAX_ATTEMPTS) {
        attempt += 1;

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
        const originalUpdatedAt = assignment.updated_at;
        // Deep-clone so retries start from a fresh copy of the just-read state
        const dateOverrides = JSON.parse(JSON.stringify(currentWorkoutData.date_overrides || {}));

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
          // Instance ID is generated per retry so a retry doesn't re-add the
          // same instance the previous attempt already wrote.
          targetOverride.addedWorkouts.push({
            instance_id: generateInstanceId(),
            day_index: resolvedDayIndex
          });

          dateOverrides[targetDate] = targetOverride;
        }

        // Save the updated workout_data, gated on updated_at matching what we read.
        // If another write raced us, updated_at will have changed and 0 rows match;
        // we then re-read and rebuild from the new base state.
        const updatedWorkoutData = {
          ...currentWorkoutData,
          date_overrides: dateOverrides
        };

        let updateQuery = supabase
          .from('client_workout_assignments')
          .update({ workout_data: updatedWorkoutData, updated_at: new Date().toISOString() })
          .eq('id', assignmentId);
        if (originalUpdatedAt) {
          updateQuery = updateQuery.eq('updated_at', originalUpdatedAt);
        }
        const { data: updateRows, error: updateError } = await updateQuery.select();

        if (updateError) {
          lastError = updateError;
          console.error('Error updating assignment (attempt ' + attempt + '):', updateError);
          break;
        }

        if (Array.isArray(updateRows) && updateRows.length > 0) {
          finalDateOverrides = updatedWorkoutData.date_overrides;
          break;
        }

        // 0 rows matched: another request updated the row. Back off briefly and retry.
        await new Promise(r => setTimeout(r, 40 * attempt));
      }

      if (finalDateOverrides === null) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to save date override',
            detail: lastError ? (lastError.message || String(lastError)) : 'write conflict (retry limit reached)'
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Workout ${action}d successfully`,
          dateOverrides: finalDateOverrides
        })
      };
    }

    // PUT - Update workout data for a specific assignment/day
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, dayIndex, workout_data, completion } = body;

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      // Validate completion-only update shape up front so we don't retry
      // a malformed request through the optimistic-concurrency loop below.
      if (completion) {
        const { dateStr, instanceId, completions } = completion;
        if (!dateStr || !instanceId || !completions || typeof completions !== 'object') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'completion requires dateStr, instanceId, and completions' })
          };
        }
      }

      // Read-modify-write under optimistic concurrency (same pattern as POST).
      // Concurrent exercise edits on the same assignment no longer clobber
      // each other — retries rebuild from the latest snapshot on conflict.
      const PUT_MAX_ATTEMPTS = 6;
      let putUpdated = null;
      let putAttempt = 0;
      let putLastError = null;

      while (putAttempt < PUT_MAX_ATTEMPTS) {
        putAttempt += 1;

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
        const originalUpdatedAt = assignment.updated_at;
        let updatedWorkoutData;

        if (completion) {
          // Per-date exercise completion update. Writes into
          // workout_data.date_overrides[dateStr].completions[instanceId] without
          // touching the shared program template, so toggling "done" on one
          // date does not leak to other dates that resolve to the same day_index.
          const { dateStr, instanceId, completions } = completion;
          const dateOverrides = { ...(currentWorkoutData.date_overrides || {}) };
          const existingOverride = dateOverrides[dateStr] || {};
          const existingCompletions = existingOverride.completions || {};
          const existingForInstance = existingCompletions[instanceId] || {};

          const mergedForInstance = { ...existingForInstance };
          for (const [k, v] of Object.entries(completions)) {
            if (v) {
              mergedForInstance[k] = true;
            } else {
              delete mergedForInstance[k];
            }
          }

          const updatedCompletions = { ...existingCompletions };
          if (Object.keys(mergedForInstance).length === 0) {
            delete updatedCompletions[instanceId];
          } else {
            updatedCompletions[instanceId] = mergedForInstance;
          }

          const updatedOverride = { ...existingOverride };
          if (Object.keys(updatedCompletions).length === 0) {
            delete updatedOverride.completions;
          } else {
            updatedOverride.completions = updatedCompletions;
          }

          if (Object.keys(updatedOverride).length === 0) {
            delete dateOverrides[dateStr];
          } else {
            dateOverrides[dateStr] = updatedOverride;
          }

          updatedWorkoutData = { ...currentWorkoutData, date_overrides: dateOverrides };
        } else if (currentWorkoutData.days && Array.isArray(currentWorkoutData.days) && dayIndex !== undefined) {
          // Handle days array structure
          const updatedDays = [...currentWorkoutData.days];
          const safeDayIndex = Math.abs(dayIndex) % updatedDays.length;
          const incomingExercises = workout_data?.exercises || workout_data?.days?.[safeDayIndex]?.exercises;
          updatedDays[safeDayIndex] = {
            ...updatedDays[safeDayIndex],
            exercises: incomingExercises || updatedDays[safeDayIndex].exercises
          };
          updatedWorkoutData = { ...currentWorkoutData, days: updatedDays };
        } else {
          updatedWorkoutData = {
            ...currentWorkoutData,
            exercises: workout_data.exercises || currentWorkoutData.exercises
          };
        }

        let updateQuery = supabase
          .from('client_workout_assignments')
          .update({ workout_data: updatedWorkoutData, updated_at: new Date().toISOString() })
          .eq('id', assignmentId);
        if (originalUpdatedAt) {
          updateQuery = updateQuery.eq('updated_at', originalUpdatedAt);
        }
        const { data: updateRows, error: updateError } = await updateQuery.select();

        if (updateError) {
          putLastError = updateError;
          console.error('Error updating assignment (PUT attempt ' + putAttempt + '):', updateError);
          break;
        }

        if (Array.isArray(updateRows) && updateRows.length > 0) {
          putUpdated = updateRows[0];
          break;
        }

        await new Promise(r => setTimeout(r, 40 * putAttempt));
      }

      if (!putUpdated) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to save workout changes',
            detail: putLastError ? (putLastError.message || String(putLastError)) : 'write conflict (retry limit reached)'
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment: putUpdated })
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
