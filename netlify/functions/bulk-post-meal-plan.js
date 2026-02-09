// Netlify Function to bulk-post a meal plan to multiple clients at once
// Creates a separate copy of the plan for each selected client and publishes them
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
    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error: Missing database credentials' })
      };
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { coachId, clientIds, planData, planName } = parsedBody;

    if (!coachId || !planData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and plan data are required' })
      };
    }

    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'At least one client ID is required' })
      };
    }

    if (clientIds.length > 50) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Cannot post to more than 50 clients at once' })
      };
    }

    // Authenticate coach
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔵 Bulk post: Coach ${user.id} posting plan to ${clientIds.length} clients`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // Verify all clients belong to this coach
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, client_name')
      .eq('coach_id', coachId)
      .in('id', clientIds);

    if (clientsError) {
      console.error('❌ Error fetching clients:', clientsError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to verify clients', details: clientsError.message })
      };
    }

    const validClientIds = new Set(clients.map(c => c.id));
    const clientNameMap = {};
    clients.forEach(c => { clientNameMap[c.id] = c.client_name; });

    // Check for invalid client IDs
    const invalidIds = clientIds.filter(id => !validClientIds.has(id));
    if (invalidIds.length > 0) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: `Some client IDs are invalid or not owned by you: ${invalidIds.join(', ')}`
        })
      };
    }

    // Build insert rows — one copy per client, all published immediately
    const now = new Date().toISOString();
    const rows = clients.map(client => ({
      coach_id: coachId,
      client_id: client.id,
      client_name: client.client_name,
      plan_name: planName || null,
      plan_data: planData,
      status: 'published',
      created_at: now
    }));

    // Batch insert
    const { data: insertedPlans, error: insertError } = await supabase
      .from('coach_meal_plans')
      .insert(rows)
      .select('id, client_id, client_name, status');

    if (insertError) {
      console.error('❌ Bulk insert error:', insertError);

      // Retry without optional columns if needed
      const fallbackRows = clients.map(client => ({
        coach_id: coachId,
        client_name: client.client_name,
        plan_data: planData,
        status: 'published',
        created_at: now
      }));

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('coach_meal_plans')
        .insert(fallbackRows)
        .select('id, client_name, status');

      if (fallbackError) {
        console.error('❌ Fallback insert also failed:', fallbackError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Failed to create meal plans',
            details: fallbackError.message
          })
        };
      }

      console.log(`✅ Bulk post (fallback): Created ${fallbackData.length} plans`);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          created: fallbackData.length,
          plans: fallbackData,
          message: `Plan posted to ${fallbackData.length} client(s) successfully!`
        })
      };
    }

    console.log(`✅ Bulk post: Created ${insertedPlans.length} plans`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        created: insertedPlans.length,
        plans: insertedPlans,
        message: `Plan posted to ${insertedPlans.length} client(s) successfully!`
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
