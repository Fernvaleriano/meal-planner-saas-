// Netlify Function to restore an archived client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { clientId } = JSON.parse(event.body);

    if (!clientId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client ID is required' })
      };
    }

    // Verify authorization
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Authorization required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the client exists and is archived
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, coach_id, client_name, archived')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found' })
      };
    }

    if (!client.archived) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client is not archived' })
      };
    }

    console.log(`♻️ Restoring client: ${client.client_name} (${clientId})`);

    // Remove archived flag
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        archived: false,
        archived_at: null
      })
      .eq('id', clientId);

    if (updateError) {
      console.error('Error restoring client:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to restore client' })
      };
    }

    console.log(`✅ Successfully restored client: ${client.client_name}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: `Client "${client.client_name}" has been restored`
      })
    };

  } catch (error) {
    console.error('❌ Restore client error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
