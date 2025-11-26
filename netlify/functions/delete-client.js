// Netlify Function to delete a client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { clientId, coachId } = body;

    // Validate required fields
    if (!clientId || !coachId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First, get the client to check if they have a user_id
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .single();

    if (fetchError || !client) {
      console.error('❌ Client not found:', fetchError);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found or unauthorized' })
      };
    }

    // If client has a user_id, delete the auth user first
    if (client.user_id) {
      console.log(`🔑 Deleting auth user: ${client.user_id}`);
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(client.user_id);
      if (authDeleteError) {
        console.warn('⚠️ Warning: Could not delete auth user:', authDeleteError.message);
        // Continue with client deletion even if auth user deletion fails
      } else {
        console.log(`✅ Auth user deleted: ${client.user_id}`);
      }
    }

    // Delete client from database
    const { data, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to delete client',
          details: error.message
        })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found or unauthorized' })
      };
    }

    console.log(`✅ Deleted client: ${data.client_name} (ID: ${clientId})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        message: 'Client deleted successfully'
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
