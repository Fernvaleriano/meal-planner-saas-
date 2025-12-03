// Netlify Function to archive a client
// This removes their data (plans, supplements, diary) but keeps basic info
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

    // Verify the client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, coach_id, client_name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found' })
      };
    }

    console.log(`📦 Archiving client: ${client.client_name} (${clientId})`);

    // Delete related data (order matters for foreign keys)
    // 1. Delete food diary entries
    const { error: diaryError } = await supabase
      .from('food_diary')
      .delete()
      .eq('client_id', clientId);
    if (diaryError) console.warn('Error deleting food diary:', diaryError.message);

    // 2. Delete calorie goals
    const { error: goalsError } = await supabase
      .from('calorie_goals')
      .delete()
      .eq('client_id', clientId);
    if (goalsError) console.warn('Error deleting calorie goals:', goalsError.message);

    // 3. Delete meal plans
    const { error: plansError } = await supabase
      .from('meal_plans')
      .delete()
      .eq('client_id', clientId);
    if (plansError) console.warn('Error deleting meal plans:', plansError.message);

    // 4. Delete client protocols (supplements)
    const { error: protocolsError } = await supabase
      .from('client_protocols')
      .delete()
      .eq('client_id', clientId);
    if (protocolsError) console.warn('Error deleting protocols:', protocolsError.message);

    // 5. Delete check-ins
    const { error: checkinsError } = await supabase
      .from('checkins')
      .delete()
      .eq('client_id', clientId);
    if (checkinsError) console.warn('Error deleting check-ins:', checkinsError.message);

    // 6. Delete measurements
    const { error: measurementsError } = await supabase
      .from('measurements')
      .delete()
      .eq('client_id', clientId);
    if (measurementsError) console.warn('Error deleting measurements:', measurementsError.message);

    // 7. Delete progress photos
    const { error: photosError } = await supabase
      .from('progress_photos')
      .delete()
      .eq('client_id', clientId);
    if (photosError) console.warn('Error deleting progress photos:', photosError.message);

    // 8. Delete favorites
    const { error: favoritesError } = await supabase
      .from('favorite_foods')
      .delete()
      .eq('client_id', clientId);
    if (favoritesError) console.warn('Error deleting favorites:', favoritesError.message);

    // Set archived flag on the client
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        archived: true,
        archived_at: new Date().toISOString()
      })
      .eq('id', clientId);

    if (updateError) {
      console.error('Error updating client archived status:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to archive client' })
      };
    }

    console.log(`✅ Successfully archived client: ${client.client_name}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: `Client "${client.client_name}" has been archived`
      })
    };

  } catch (error) {
    console.error('❌ Archive client error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
