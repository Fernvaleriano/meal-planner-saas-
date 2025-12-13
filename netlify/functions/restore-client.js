// Netlify Function to restore an archived client
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
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
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔐 Authenticated coach ${user.id} restoring client ${clientId}`);

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First, get the client to verify ownership and check status
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

    if (!client.is_archived) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client is not archived' })
      };
    }

    console.log(`♻️ Restoring client: ${client.client_name} (ID: ${clientId})`);

    // Update client record to restore
    const { data: updatedClient, error: updateError } = await supabase
      .from('clients')
      .update({
        is_archived: false,
        archived_at: null
      })
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error restoring client:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to restore client',
          details: updateError.message
        })
      };
    }

    console.log(`✅ Client restored: ${client.client_name} (ID: ${clientId})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        success: true,
        message: 'Client restored successfully',
        client: {
          id: updatedClient.id,
          name: updatedClient.client_name
        }
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
