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
    // GET - Fetch global references for a coach
    // Query params: coachId (required), exerciseName (optional - fetch for specific exercise)
    if (event.httpMethod === 'GET') {
      const { coachId, exerciseName } = event.queryStringParameters || {};

      if (!coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      let query = supabase
        .from('coach_exercise_references')
        .select('*')
        .eq('coach_id', coachId);

      if (exerciseName) {
        // Case-insensitive match on exercise name
        query = query.ilike('exercise_name', exerciseName);
      }

      query = query.order('exercise_name', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ references: data || [] })
      };
    }

    // POST - Save or update global references for an exercise
    // Body: { coachId, exerciseName, referenceLinks }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { coachId, exerciseName, referenceLinks } = body;

      if (!coachId || !exerciseName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and exerciseName are required' })
        };
      }

      if (!Array.isArray(referenceLinks) || referenceLinks.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'referenceLinks must be a non-empty array' })
        };
      }

      // Upsert: insert or update if already exists for this coach + exercise name
      const { data, error } = await supabase
        .from('coach_exercise_references')
        .upsert({
          coach_id: coachId,
          exercise_name: exerciseName.trim(),
          reference_links: referenceLinks,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'coach_id,exercise_name'
        })
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, reference: data })
      };
    }

    // DELETE - Remove global references for an exercise
    // Query params: coachId, exerciseName
    if (event.httpMethod === 'DELETE') {
      const { coachId, exerciseName } = event.queryStringParameters || {};

      if (!coachId || !exerciseName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and exerciseName are required' })
        };
      }

      const { error } = await supabase
        .from('coach_exercise_references')
        .delete()
        .eq('coach_id', coachId)
        .ilike('exercise_name', exerciseName);

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
    console.error('Exercise references error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
