// Netlify Function for clients to delete their own account
// Required for Apple App Store & Google Play compliance
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Authenticate the requesting user
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find the client record linked to this auth user
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_name, coach_id, email')
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      console.error('Client not found for user:', user.id, clientError?.message);
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Account not found' })
      };
    }

    console.log(`Deleting account for client: ${client.client_name} (${client.id})`);

    // Delete related data in order to respect foreign key constraints
    // These will silently succeed even if no rows exist
    const tables = [
      'food_diary',
      'chat_messages',
      'client_checkins',
      'workout_logs',
      'progress_photos',
      'saved_meals',
      'water_intake',
      'supplement_intake',
      'client_daily_wins',
      'notifications',
      'story_views',
      'story_reactions',
      'story_replies',
      'measurements',
    ];

    for (const table of tables) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('client_id', client.id);

      if (deleteError) {
        console.warn(`Warning: Could not clean ${table}:`, deleteError.message);
        // Continue - some tables may not exist or have different column names
      }
    }

    // Delete the client record
    const { error: clientDeleteError } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id);

    if (clientDeleteError) {
      console.error('Failed to delete client record:', clientDeleteError.message);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to delete account' })
      };
    }

    // Delete the auth user last
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      console.error('Failed to delete auth user:', authDeleteError.message);
      // Client record is already deleted, so the account is effectively gone
      // The orphaned auth user will fail to log in since no client record exists
    }

    console.log(`Account deleted successfully: ${client.client_name} (${client.id})`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Account deleted successfully'
      })
    };

  } catch (error) {
    console.error('Delete account error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
