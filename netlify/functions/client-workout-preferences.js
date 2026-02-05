/**
 * API Endpoint: Client Workout Preferences
 *
 * Allows clients to manage their workout preferences (like preferred exercise demonstration gender).
 *
 * Endpoints:
 * GET  /client-workout-preferences?clientId=xxx  - Get client's workout preferences
 * POST /client-workout-preferences               - Update client's workout preferences
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const params = event.queryStringParameters || {};

    // GET - Fetch client workout preferences
    if (event.httpMethod === 'GET') {
      const { clientId } = params;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const { data, error } = await supabase
        .from('clients')
        .select('id, preferred_exercise_gender, unit_preference')
        .eq('id', clientId)
        .single();

      if (error) {
        // Column might not exist yet
        if (error.message?.includes('preferred_exercise_gender')) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              preferences: {
                client_id: parseInt(clientId),
                preferred_exercise_gender: 'all',
                unit_preference: 'metric'
              },
              needsMigration: true
            })
          };
        }
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          preferences: {
            client_id: data.id,
            preferred_exercise_gender: data.preferred_exercise_gender || 'all',
            unit_preference: data.unit_preference || 'metric'
          }
        })
      };
    }

    // POST - Update client workout preferences
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, preferredExerciseGender, unitPreference } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      // Validate preferredExerciseGender value
      const validGenders = ['all', 'male', 'female'];
      if (preferredExerciseGender && !validGenders.includes(preferredExerciseGender)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid preferredExerciseGender. Must be: all, male, or female'
          })
        };
      }

      // Validate unitPreference value
      const validUnits = ['metric', 'imperial'];
      if (unitPreference && !validUnits.includes(unitPreference)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid unitPreference. Must be: metric or imperial'
          })
        };
      }

      const updateData = {};
      if (preferredExerciseGender !== undefined) {
        updateData.preferred_exercise_gender = preferredExerciseGender;
      }
      if (unitPreference !== undefined) {
        updateData.unit_preference = unitPreference;
      }

      if (Object.keys(updateData).length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'No preferences to update' })
        };
      }

      const { data, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', clientId)
        .select('id, preferred_exercise_gender, unit_preference')
        .single();

      if (error) {
        // Column might not exist yet
        if (error.message?.includes('preferred_exercise_gender')) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'Workout preferences not available',
              needsMigration: true,
              message: 'The preferred_exercise_gender column needs to be added to the clients table.'
            })
          };
        }
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          preferences: {
            client_id: data.id,
            preferred_exercise_gender: data.preferred_exercise_gender || 'all',
            unit_preference: data.unit_preference || 'metric'
          }
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Error in client-workout-preferences:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
