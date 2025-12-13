// Netlify Function to delete a client
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
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

    console.log(`🔐 Authenticated coach ${user.id} deleting client ${clientId}`);

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

    // Delete auth user if client has a user_id
    if (client.user_id) {
      console.log(`🔑 Deleting auth user by user_id: ${client.user_id}`);
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(client.user_id);
      if (authDeleteError) {
        console.warn('⚠️ Warning: Could not delete auth user:', authDeleteError.message);
        // Continue with client deletion even if auth user deletion fails
      } else {
        console.log(`✅ Auth user deleted: ${client.user_id}`);
      }
    } else if (client.email) {
      // No user_id set, but check for orphaned auth users with same email
      // This handles cases where auth user was created but DB update failed
      console.log(`🔍 Checking for orphaned auth user with email: ${client.email}`);

      let page = 1;
      const perPage = 100;
      let orphanedUser = null;

      while (!orphanedUser) {
        const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
          page: page,
          perPage: perPage
        });

        if (listError || !usersPage || !usersPage.users || usersPage.users.length === 0) {
          break;
        }

        orphanedUser = usersPage.users.find(u => u.email === client.email);

        if (orphanedUser) {
          console.log(`🔑 Found orphaned auth user for email ${client.email}: ${orphanedUser.id}`);
          const { error: authDeleteError } = await supabase.auth.admin.deleteUser(orphanedUser.id);
          if (authDeleteError) {
            console.warn('⚠️ Warning: Could not delete orphaned auth user:', authDeleteError.message);
          } else {
            console.log(`✅ Orphaned auth user deleted: ${orphanedUser.id}`);
          }
          break;
        }

        if (usersPage.users.length < perPage) {
          break;
        }

        page++;
        if (page > 100) {
          console.warn('⚠️ Reached pagination limit while searching for orphaned user');
          break;
        }
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
