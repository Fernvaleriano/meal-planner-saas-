// Netlify Function to retrieve a specific meal plan by ID
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const planId = event.queryStringParameters.planId;
    const coachId = event.queryStringParameters.coachId;

    if (!planId || !coachId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Plan ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Retrieve the specific meal plan
    const { data, error } = await supabase
      .from('coach_meal_plans')
      .select('*')
      .eq('id', planId)
      .eq('coach_id', coachId)
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Meal plan not found',
          details: error.message
        })
      };
    }

    console.log(`✅ Retrieved meal plan ${planId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        plan: data
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
