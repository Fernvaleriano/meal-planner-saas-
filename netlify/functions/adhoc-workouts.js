const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
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
    // GET - Fetch ad-hoc workouts for a specific client and date
    if (event.httpMethod === 'GET') {
      const { clientId, date } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      let query = supabase
        .from('client_adhoc_workouts')
        .select('*')
        .eq('client_id', clientId);

      if (date) {
        query = query.eq('workout_date', date);
      }

      const { data: workouts, error } = await query.order('created_at', { ascending: false });

      if (error) {
        // Table might not exist, return empty
        console.error('Error fetching adhoc workouts:', error);
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

    // POST - Create a new ad-hoc workout (client-initiated)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, workoutDate, workoutData, name } = body;

      if (!clientId || !workoutDate) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId and workoutDate are required' })
        };
      }

      // Check if there's already an ad-hoc workout for this date
      const { data: existing } = await supabase
        .from('client_adhoc_workouts')
        .select('id')
        .eq('client_id', clientId)
        .eq('workout_date', workoutDate)
        .maybeSingle();

      if (existing) {
        // Update existing ad-hoc workout
        const { data: updated, error: updateError } = await supabase
          .from('client_adhoc_workouts')
          .update({
            name: name || 'Custom Workout',
            workout_data: workoutData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating adhoc workout:', updateError);
          throw updateError;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, workout: updated })
        };
      }

      // Create new ad-hoc workout
      const { data: workout, error } = await supabase
        .from('client_adhoc_workouts')
        .insert([{
          client_id: clientId,
          workout_date: workoutDate,
          name: name || 'Custom Workout',
          workout_data: workoutData,
          is_active: true
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating adhoc workout:', error);
        // If table doesn't exist, try to create it
        if (error.code === '42P01') {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: 'Adhoc workouts table not set up. Please contact support.',
              needsSetup: true
            })
          };
        }
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // PUT - Update an ad-hoc workout
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { workoutId, clientId, workoutDate, workoutData, name } = body;

      // Can update by ID or by client+date
      let query;
      if (workoutId) {
        query = supabase
          .from('client_adhoc_workouts')
          .update({
            name: name,
            workout_data: workoutData,
            updated_at: new Date().toISOString()
          })
          .eq('id', workoutId);
      } else if (clientId && workoutDate) {
        query = supabase
          .from('client_adhoc_workouts')
          .update({
            name: name,
            workout_data: workoutData,
            updated_at: new Date().toISOString()
          })
          .eq('client_id', clientId)
          .eq('workout_date', workoutDate);
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId or (clientId + workoutDate) required' })
        };
      }

      const { data: updated, error } = await query.select().single();

      if (error) {
        console.error('Error updating adhoc workout:', error);
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout: updated })
      };
    }

    // DELETE - Remove an ad-hoc workout
    if (event.httpMethod === 'DELETE') {
      const { workoutId, clientId, date } = event.queryStringParameters || {};

      if (workoutId) {
        const { error } = await supabase
          .from('client_adhoc_workouts')
          .delete()
          .eq('id', workoutId);

        if (error) throw error;
      } else if (clientId && date) {
        const { error } = await supabase
          .from('client_adhoc_workouts')
          .delete()
          .eq('client_id', clientId)
          .eq('workout_date', date);

        if (error) throw error;
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId or (clientId + date) required' })
        };
      }

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
    console.error('Adhoc workouts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};
