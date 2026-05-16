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
    // GET - Fetch workout programs
    if (event.httpMethod === 'GET') {
      const { coachId, programId } = event.queryStringParameters || {};

      // Get single program by ID
      if (programId) {
        const { data: program, error } = await supabase
          .from('workout_programs')
          .select('*')
          .eq('id', programId)
          .single();

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ program })
        };
      }

      // Get all programs for a coach
      if (!coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      const { data: programs, error } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('coach_id', coachId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ programs: programs || [] })
      };
    }

    // POST - Create a workout program
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        coachId,
        name,
        description,
        programType,
        difficulty,
        durationWeeks,
        daysPerWeek,
        programData,
        isTemplate,
        isPublished,
        heroImageUrl,
        isClubWorkout
      } = body;

      if (!coachId || !name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and name are required' })
        };
      }

      const { data: program, error } = await supabase
        .from('workout_programs')
        .insert([{
          coach_id: coachId,
          name,
          description,
          program_type: programType,
          difficulty,
          duration_weeks: durationWeeks,
          days_per_week: daysPerWeek,
          program_data: {
            ...(programData || {}),
            image_url: heroImageUrl || null
          },
          is_template: isTemplate !== false,
          is_published: isPublished || false,
          is_club_workout: isClubWorkout || false
        }])
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, program })
      };
    }

    // PUT - Update a workout program
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { programId, ...updateData } = body;

      if (!programId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'programId is required' })
        };
      }

      // Map camelCase to snake_case
      const updateFields = {};
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.description !== undefined) updateFields.description = updateData.description;
      if (updateData.programType !== undefined) updateFields.program_type = updateData.programType;
      if (updateData.difficulty !== undefined) updateFields.difficulty = updateData.difficulty;
      if (updateData.durationWeeks !== undefined) updateFields.duration_weeks = updateData.durationWeeks;
      if (updateData.daysPerWeek !== undefined) updateFields.days_per_week = updateData.daysPerWeek;
      if (updateData.isTemplate !== undefined) updateFields.is_template = updateData.isTemplate;
      if (updateData.isPublished !== undefined) updateFields.is_published = updateData.isPublished;
      if (updateData.isClubWorkout !== undefined) updateFields.is_club_workout = updateData.isClubWorkout;

      // Fetch existing program to preserve image_url if not explicitly changed
      let existingImageUrl = null;
      if (updateData.programData !== undefined || updateData.heroImageUrl !== undefined) {
        const { data: existing } = await supabase
          .from('workout_programs')
          .select('program_data')
          .eq('id', programId)
          .single();
        existingImageUrl = existing?.program_data?.image_url || null;

        updateFields.program_data = {
          ...(updateData.programData || {}),
          image_url: updateData.heroImageUrl !== undefined
            ? updateData.heroImageUrl
            : (updateData.programData?.image_url || existingImageUrl)
        };
      }

      const { data: program, error } = await supabase
        .from('workout_programs')
        .update(updateFields)
        .eq('id', programId)
        .select()
        .single();

      if (error) throw error;

      // If requested, propagate changes to all active client assignments using this program
      let updatedAssignments = 0;
      let totalActiveAssignments = 0;
      if (updateData.updateClientAssignments) {
        // Build query - use program_id, and also match by coach_id for safety
        let query = supabase
          .from('client_workout_assignments')
          .select('id, workout_data, client_id')
          .eq('program_id', programId)
          .eq('is_active', true);

        // Add coach_id filter if the program has one
        if (program.coach_id) {
          query = query.eq('coach_id', program.coach_id);
        }

        // If specific assignment IDs were provided, restrict propagation to those only
        if (Array.isArray(updateData.assignmentIds) && updateData.assignmentIds.length > 0) {
          query = query.in('id', updateData.assignmentIds);
        }

        const { data: activeAssignments, error: fetchError } = await query;

        if (fetchError) {
          console.error('Error fetching active assignments for propagation:', fetchError);
        } else {
          totalActiveAssignments = activeAssignments ? activeAssignments.length : 0;

          // Per-assignment set of exercise ids the client has ALREADY logged
          // (any non-empty sets_data). A coach program/bulk/"Save & Update"
          // push must NOT clobber an exercise the client has already worked —
          // those keep the client's existing version; only exercises with no
          // client log get the new coach plan. Two batched queries total
          // (NOT one-per-assignment), so propagation stays O(1) in round-trips.
          const loggedByAssignment = new Map(); // assignmentId -> Set(String(exercise_id))
          if (updateFields.program_data !== undefined && activeAssignments && activeAssignments.length > 0) {
            const ids = activeAssignments.map(a => a.id);
            const { data: wls, error: wlErr } = await supabase
              .from('workout_logs')
              .select('id, assignment_id')
              .in('assignment_id', ids);
            if (wlErr) {
              // Fail safe: if we can't tell what's logged, do NOT overwrite
              // anyone — skip propagation rather than risk erasing client work.
              console.error('client-log lookup failed; skipping workout_data propagation:', wlErr);
              updateFields.program_data = undefined;
            } else {
              const logToAssignment = new Map((wls || []).map(l => [l.id, l.assignment_id]));
              const logIds = (wls || []).map(l => l.id);
              if (logIds.length > 0) {
                const { data: exLogs, error: elErr } = await supabase
                  .from('exercise_logs')
                  .select('workout_log_id, exercise_id, sets_data')
                  .in('workout_log_id', logIds);
                if (elErr) {
                  console.error('client-log lookup failed; skipping workout_data propagation:', elErr);
                  updateFields.program_data = undefined;
                } else {
                  for (const el of exLogs || []) {
                    const hasClientSets = Array.isArray(el.sets_data) && el.sets_data.length > 0;
                    if (!hasClientSets || el.exercise_id == null) continue;
                    const aId = logToAssignment.get(el.workout_log_id);
                    if (aId == null) continue;
                    if (!loggedByAssignment.has(aId)) loggedByAssignment.set(aId, new Set());
                    loggedByAssignment.get(aId).add(String(el.exercise_id));
                  }
                }
              }
            }
          }

          if (activeAssignments && activeAssignments.length > 0) {
            for (const assignment of activeAssignments) {
              const assignmentUpdate = {};

              // Update name if it changed
              if (updateFields.name !== undefined) {
                assignmentUpdate.name = updateFields.name;
              }

              // Update workout_data (program_data) while preserving assignment-specific fields like schedule and date_overrides
              if (updateFields.program_data !== undefined) {
                const existingData = assignment.workout_data || {};
                const loggedIds = loggedByAssignment.get(assignment.id) || new Set();

                // Index the client's CURRENT exercises by id so a logged
                // exercise keeps exactly what the client has been doing, even
                // if the coach reordered/moved days in the new plan.
                const preservedById = new Map();
                const collect = (data) => {
                  const days = Array.isArray(data?.days)
                    ? data.days
                    : (Array.isArray(data?.exercises) ? [{ exercises: data.exercises }] : []);
                  for (const d of days) {
                    for (const ex of (d && d.exercises) || []) {
                      if (ex && ex.id != null && !preservedById.has(String(ex.id))) {
                        preservedById.set(String(ex.id), ex);
                      }
                    }
                  }
                };
                collect(existingData);

                const mergeExercise = (newEx) => {
                  if (
                    newEx && newEx.id != null &&
                    loggedIds.has(String(newEx.id)) &&
                    preservedById.has(String(newEx.id))
                  ) {
                    // Client already logged this exercise -> keep their version,
                    // do not overwrite with the coach's new plan.
                    return preservedById.get(String(newEx.id));
                  }
                  return newEx;
                };

                const newProgram = updateFields.program_data || {};
                let mergedProgram;
                if (Array.isArray(newProgram.days)) {
                  mergedProgram = {
                    ...newProgram,
                    days: newProgram.days.map(d => ({
                      ...d,
                      exercises: ((d && d.exercises) || []).map(mergeExercise)
                    }))
                  };
                } else if (Array.isArray(newProgram.exercises)) {
                  mergedProgram = {
                    ...newProgram,
                    exercises: newProgram.exercises.map(mergeExercise)
                  };
                } else {
                  mergedProgram = newProgram;
                }

                assignmentUpdate.workout_data = {
                  ...mergedProgram,
                  // Preserve client-specific schedule and date overrides
                  schedule: existingData.schedule,
                  date_overrides: existingData.date_overrides
                };
              }

              if (Object.keys(assignmentUpdate).length > 0) {
                const { error: updateError } = await supabase
                  .from('client_workout_assignments')
                  .update(assignmentUpdate)
                  .eq('id', assignment.id);

                if (updateError) {
                  console.error(`Error updating assignment ${assignment.id}:`, updateError);
                } else {
                  updatedAssignments++;
                }
              }
            }
          }
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, program, updatedAssignments, totalActiveAssignments })
      };
    }

    // DELETE - Delete a workout program
    if (event.httpMethod === 'DELETE') {
      const { programId } = event.queryStringParameters || {};

      if (!programId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'programId is required' })
        };
      }

      const { error } = await supabase
        .from('workout_programs')
        .delete()
        .eq('id', programId);

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
    console.error('Workout programs error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
