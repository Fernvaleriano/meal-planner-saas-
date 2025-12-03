// Netlify Function to track client portal activity
// Updates the last_activity_at timestamp for a client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { userId } = body;

    // Validate required fields
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Update the client's last_activity_at timestamp
    const { data, error } = await supabase
      .from('clients')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('id, client_name')
      .single();

    if (error) {
      // Don't fail if client not found - might be a coach or other user type
      if (error.code === 'PGRST116') {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
          },
          body: JSON.stringify({ success: true, message: 'No client found for user' })
        };
      }

      console.error('❌ Error updating activity:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update activity',
          details: error.message
        })
      };
    }

    console.log(`📍 Activity tracked for client: ${data?.client_name} (ID: ${data?.id})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
