const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Beta users with gym features enabled
const BETA_USERS = [
  'valeriano_fernando@yahoo.com'
];

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    // GET - Check if gym features are enabled for a user
    if (event.httpMethod === 'GET') {
      const { email, coachId } = event.queryStringParameters || {};

      // Method 1: Check by email (beta list)
      if (email) {
        const isEnabled = BETA_USERS.includes(email.toLowerCase());
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            enabled: isEnabled,
            method: 'beta_list'
          })
        };
      }

      // Method 2: Check by coach_id - lookup email and check beta list
      if (coachId) {
        // First, look up the coach's email from auth.users
        const { data: userData, error: userError } = await supabase
          .auth.admin.getUserById(coachId);

        if (!userError && userData?.user?.email) {
          const coachEmail = userData.user.email.toLowerCase();
          if (BETA_USERS.includes(coachEmail)) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                enabled: true,
                method: 'beta_list_by_coach_id'
              })
            };
          }
        }

        // Fallback: Check database settings
        const { data: settings, error } = await supabase
          .from('coach_settings')
          .select('gym_features_enabled')
          .eq('coach_id', coachId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
          // Don't throw, just return false
          console.log('No coach_settings found for', coachId);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            enabled: settings?.gym_features_enabled || false,
            method: 'database'
          })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'email or coachId required' })
      };
    }

    // POST - Enable gym features for a user (admin only, future use)
    if (event.httpMethod === 'POST') {
      const { coachId, enabled } = JSON.parse(event.body || '{}');

      if (!coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId is required' })
        };
      }

      const { data, error } = await supabase
        .from('coach_settings')
        .upsert({
          coach_id: coachId,
          gym_features_enabled: enabled !== false
        }, {
          onConflict: 'coach_id'
        })
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, settings: data })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Gym features error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
