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

      // Store image_url inside program_data
      if (updateData.programData !== undefined || updateData.heroImageUrl !== undefined) {
        updateFields.program_data = {
          ...(updateData.programData || {}),
          image_url: updateData.heroImageUrl !== undefined ? updateData.heroImageUrl : (updateData.programData?.image_url || null)
        };
      }

      const { data: program, error } = await supabase
        .from('workout_programs')
        .update(updateFields)
        .eq('id', programId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, program })
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
