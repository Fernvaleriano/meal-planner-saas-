// Netlify Function to delete a coach's meal plan
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
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

    // Delete the meal plan (RLS policies ensure only the owner can delete)
    const { error } = await supabase
      .from('coach_meal_plans')
      .delete()
      .eq('id', planId)
      .eq('coach_id', coachId);

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to delete meal plan',
          details: error.message
        })
      };
    }

    console.log('Plan deleted:', planId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        message: 'Plan deleted successfully'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
