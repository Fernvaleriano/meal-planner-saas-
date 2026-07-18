const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Shared cover-photo library. The founder curates these in the public
// "Default Workout Pictures" bucket; every new program gets one so a card is
// never left with a blank cover (the client AI generator picks one too, but we
// default here as well so it always happens, even if the client couldn't).
const DEFAULT_COVER_BUCKET = 'Default Workout Pictures';

// Pick a random cover from the shared library. Best-effort: returns null on any
// error so saving a program never fails just because of a cover lookup.
async function pickRandomDefaultCover(supabase) {
  try {
    const { data: files, error } = await supabase.storage
      .from(DEFAULT_COVER_BUCKET)
      .list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
    if (error || !files) return null;
    const covers = files.filter(
      (f) => f && f.name && !f.name.startsWith('.') && /\.(jpe?g|png|webp|gif)$/i.test(f.name)
    );
    if (!covers.length) return null;
    const pick = covers[Math.floor(Math.random() * covers.length)];
    const { data } = supabase.storage.from(DEFAULT_COVER_BUCKET).getPublicUrl(pick.name);
    return data?.publicUrl || null;
  } catch (e) {
    console.error('Could not pick a default cover:', e);
    return null;
  }
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
    // GET - Fetch workout programs
    if (event.httpMethod === 'GET') {
      const { coachId, programId, summary } = event.queryStringParameters || {};

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
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Opt-in lightweight mode (?summary=1). Returning every program's full
      // program_data pushes the response past Netlify's 6MB body limit once a
      // coach has many programs (causing a 502). List views request summary mode
      // and fetch a program's full contents on demand via ?programId=. Callers
      // that need the full data (e.g. assigning a program to a client) omit the
      // flag and get the unchanged full payload.
      if (summary === '1' || summary === 'true') {
        const lightweight = (programs || []).map((p) => {
          const days = (p.program_data && Array.isArray(p.program_data.days)) ? p.program_data.days : [];
          const exerciseCount = days.reduce((sum, d) => sum + ((d.exercises && d.exercises.length) || 0), 0);
          const { program_data, ...rest } = p;
          return {
            ...rest,
            days_count: days.length,
            exercise_count: exerciseCount,
            image_url: (program_data && program_data.image_url) || null
          };
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ programs: lightweight })
        };
      }

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

      // Cover photo: use whatever was chosen (explicit hero image, or one the
      // client/AI generator already tucked into program_data). If none was
      // provided, default to a random photo from the shared library so a
      // program is never saved with a blank cover. The founder can change it
      // later per program.
      let resolvedImageUrl = heroImageUrl || (programData && programData.image_url) || null;
      if (!resolvedImageUrl) {
        resolvedImageUrl = await pickRandomDefaultCover(supabase);
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
            image_url: resolvedImageUrl
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
                assignmentUpdate.workout_data = {
                  ...updateFields.program_data,
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
