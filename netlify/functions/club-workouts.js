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
    // GET - Fetch club workouts
    if (event.httpMethod === 'GET') {
      const { coachId, category, workoutId } = event.queryStringParameters || {};

      // Get single club workout by ID
      if (workoutId) {
        const { data: workout, error } = await supabase
          .from('club_workouts')
          .select('*')
          .eq('id', workoutId)
          .single();

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ workout })
        };
      }

      if (!coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      let query = supabase
        .from('club_workouts')
        .select('*')
        .eq('coach_id', coachId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data: workouts, error } = await query;

      if (error) {
        console.error('Error fetching club workouts:', error);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ workouts: [] })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ workouts: workouts || [] })
      };
    }

    // POST - Create a new club workout (coach only)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { coachId, name, description, category, difficulty, workoutData } = body;

      if (!coachId || !name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and name are required' })
        };
      }

      const { data: workout, error } = await supabase
        .from('club_workouts')
        .insert([{
          coach_id: coachId,
          name,
          description: description || null,
          category: category || 'general',
          difficulty: difficulty || 'intermediate',
          workout_data: workoutData || { exercises: [] },
          is_active: true
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating club workout:', error);
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // PUT - Update a club workout
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { workoutId, name, description, category, difficulty, workoutData, isActive } = body;

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      const updateFields = {};
      if (name !== undefined) updateFields.name = name;
      if (description !== undefined) updateFields.description = description;
      if (category !== undefined) updateFields.category = category;
      if (difficulty !== undefined) updateFields.difficulty = difficulty;
      if (workoutData !== undefined) updateFields.workout_data = workoutData;
      if (isActive !== undefined) updateFields.is_active = isActive;

      const { data: workout, error } = await supabase
        .from('club_workouts')
        .update(updateFields)
        .eq('id', workoutId)
        .select()
        .single();

      if (error) {
        console.error('Error updating club workout:', error);
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // DELETE - Remove a club workout
    if (event.httpMethod === 'DELETE') {
      const { workoutId } = event.queryStringParameters || {};

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      const { error } = await supabase
        .from('club_workouts')
        .delete()
        .eq('id', workoutId);

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

  } catch (error) {
    console.error('Club workouts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};
