// Netlify Function to update an existing client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow PUT requests
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { clientId, coachId, clientName, email, phone, notes, defaultDietaryRestrictions, defaultGoal } = body;

    // Validate required fields
    if (!clientId || !coachId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build update object with only provided fields
    const updateData = {};
    if (clientName !== undefined) updateData.client_name = clientName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes;
    if (defaultDietaryRestrictions !== undefined) updateData.default_dietary_restrictions = defaultDietaryRestrictions;
    if (defaultGoal !== undefined) updateData.default_goal = defaultGoal;

    // Update client (verify it belongs to this coach)
    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update client',
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

    console.log(`✅ Updated client: ${data.client_name} (ID: ${clientId})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        client: data
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
