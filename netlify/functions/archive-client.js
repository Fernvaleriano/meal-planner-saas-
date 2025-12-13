// Netlify Function to archive a client
// Deletes all client data (plans, diary, supplements, etc.) but keeps basic client info
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

    console.log(`🔐 Authenticated coach ${user.id} archiving client ${clientId}`);

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

    if (client.is_archived) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client is already archived' })
      };
    }

    console.log(`📦 Starting archive process for client: ${client.client_name} (ID: ${clientId})`);

    // Delete auth user if client has a user_id (revoke portal access)
    if (client.user_id) {
      console.log(`🔑 Deleting auth user: ${client.user_id}`);
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(client.user_id);
      if (authDeleteError) {
        console.warn('⚠️ Warning: Could not delete auth user:', authDeleteError.message);
      } else {
        console.log(`✅ Auth user deleted: ${client.user_id}`);
      }
    }

    // Delete all related data
    const deletionResults = [];

    // 1. Delete meal plans
    const { error: plansError, count: plansCount } = await supabase
      .from('coach_meal_plans')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'coach_meal_plans', count: plansCount, error: plansError?.message });

    // 2. Delete food diary entries
    const { error: diaryError, count: diaryCount } = await supabase
      .from('food_diary_entries')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'food_diary_entries', count: diaryCount, error: diaryError?.message });

    // 3. Delete calorie goals
    const { error: goalsError, count: goalsCount } = await supabase
      .from('calorie_goals')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'calorie_goals', count: goalsCount, error: goalsError?.message });

    // 4. Delete supplement protocols
    const { error: protocolsError, count: protocolsCount } = await supabase
      .from('client_protocols')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'client_protocols', count: protocolsCount, error: protocolsError?.message });

    // 5. Delete measurements
    const { error: measurementsError, count: measurementsCount } = await supabase
      .from('client_measurements')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'client_measurements', count: measurementsCount, error: measurementsError?.message });

    // 6. Delete progress photos
    const { error: photosError, count: photosCount } = await supabase
      .from('progress_photos')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'progress_photos', count: photosCount, error: photosError?.message });

    // 7. Delete meal checkins
    const { error: checkinsError, count: checkinsCount } = await supabase
      .from('meal_checkins')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'meal_checkins', count: checkinsCount, error: checkinsError?.message });

    // 8. Delete favorites
    const { error: favoritesError, count: favoritesCount } = await supabase
      .from('client_favorites')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'client_favorites', count: favoritesCount, error: favoritesError?.message });

    // 9. Delete weight logs
    const { error: weightError, count: weightCount } = await supabase
      .from('weight_logs')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'weight_logs', count: weightCount, error: weightError?.message });

    // 10. Delete water intake logs
    const { error: waterError, count: waterCount } = await supabase
      .from('water_intake')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'water_intake', count: waterCount, error: waterError?.message });

    // 11. Delete notifications
    const { error: notificationsError, count: notificationsCount } = await supabase
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('client_id', clientId);
    deletionResults.push({ table: 'notifications', count: notificationsCount, error: notificationsError?.message });

    // Log deletion results
    console.log('📊 Deletion results:', deletionResults);

    // Update client record to mark as archived
    const { data: updatedClient, error: updateError } = await supabase
      .from('clients')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        user_id: null, // Clear user_id since auth user was deleted
        invited_at: null,
        registered_at: null
      })
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating client:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to archive client',
          details: updateError.message
        })
      };
    }

    console.log(`✅ Client archived: ${client.client_name} (ID: ${clientId})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        success: true,
        message: 'Client archived successfully',
        client: {
          id: updatedClient.id,
          name: updatedClient.client_name,
          archivedAt: updatedClient.archived_at
        },
        deletedData: deletionResults.filter(r => r.count > 0)
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
