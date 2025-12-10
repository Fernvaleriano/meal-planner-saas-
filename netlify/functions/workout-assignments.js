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
      const { clientId, coachId, assignmentId, activeOnly } = event.queryStringParameters || {};

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
        workoutData
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

      // Create new assignment
      const { data: assignment, error } = await supabase
        .from('client_workout_assignments')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          program_id: programId,
          name: finalName || 'Custom Workout Plan',
          start_date: startDate,
          end_date: endDate,
          workout_data: finalWorkoutData || {},
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
