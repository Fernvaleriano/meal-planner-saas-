// Netlify Function to reset client's modifications back to coach's original plan
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
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
    const { planId, clientId } = JSON.parse(event.body);

    if (!planId || !clientId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Plan ID and Client ID are required'
        })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First, verify the plan exists and belongs to this client
    const { data: existingPlan, error: fetchError } = await supabase
      .from('coach_meal_plans')
      .select('id, client_id, plan_data, client_modified_data')
      .eq('id', planId)
      .single();

    if (fetchError || !existingPlan) {
      console.error('Plan not found:', fetchError);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Plan not found' })
      };
    }

    // Verify client owns this plan
    if (existingPlan.client_id !== clientId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not authorized to reset this plan' })
      };
    }

    // Check if there are actually modifications to reset
    if (!existingPlan.client_modified_data) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: true,
          message: 'Plan is already at original version',
          alreadyOriginal: true
        })
      };
    }

    // Clear the client_modified_data to revert to coach's original
    const { data, error } = await supabase
      .from('coach_meal_plans')
      .update({
        client_modified_data: null,
        client_modified_at: null
      })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Reset error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to reset plan',
          details: error.message
        })
      };
    }

    console.log(`Client ${clientId} reset plan ${planId} to original`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Plan reset to original version',
        plan: data
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
