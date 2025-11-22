// Netlify Function to retrieve a shared meal plan from Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
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
    const shareId = event.queryStringParameters.shareId;

    if (!shareId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Share ID is required' })
      };
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Retrieve the shared plan from the database
    const { data, error } = await supabase
      .from('shared_meal_plans')
      .select('plan_data, created_at')
      .eq('share_id', shareId)
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Shared plan not found',
          details: error.message
        })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Shared plan not found' })
      };
    }

    console.log('✅ Retrieved shared plan:', shareId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        planData: data.plan_data,
        createdAt: data.created_at
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
