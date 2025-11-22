// Netlify Function to create a new client
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
    const { coachId, clientName, email, phone, notes, defaultDietaryRestrictions, defaultGoal } = body;

    // Validate required fields
    if (!coachId || !clientName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Coach ID and client name are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Insert new client
    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          coach_id: coachId,
          client_name: clientName,
          email: email || null,
          phone: phone || null,
          notes: notes || null,
          default_dietary_restrictions: defaultDietaryRestrictions || [],
          default_goal: defaultGoal || null
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to create client',
          details: error.message
        })
      };
    }

    console.log(`✅ Created client: ${clientName} (ID: ${data.id})`);

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
