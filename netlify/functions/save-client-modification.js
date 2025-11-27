// Netlify Function to save client's modifications to their meal plan
// This preserves the coach's original plan while allowing clients to customize
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
        'Access-Control-Allow-Headers': 'Content-Type',
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
    const { planId, clientId, modifiedPlanData } = JSON.parse(event.body);

    if (!planId || !clientId || !modifiedPlanData) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Plan ID, Client ID, and modified plan data are required'
        })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First, verify the plan exists and belongs to this client
    const { data: existingPlan, error: fetchError } = await supabase
      .from('coach_meal_plans')
      .select('id, client_id, plan_data')
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
        body: JSON.stringify({ error: 'Not authorized to modify this plan' })
      };
    }

    // Save client's modifications to client_modified_data column
    // This preserves the original plan_data from the coach
    const { data, error } = await supabase
      .from('coach_meal_plans')
      .update({
        client_modified_data: modifiedPlanData,
        client_modified_at: new Date().toISOString()
      })
      .eq('id', planId)
      .select()
      .single();

    // If column doesn't exist, try adding it first (for older schemas)
    if (error && (error.message.includes('client_modified_data') || error.code === '42703')) {
      console.log('client_modified_data column may not exist, attempting without timestamp...');

      // Try just the data column
      const { data: retryData, error: retryError } = await supabase
        .from('coach_meal_plans')
        .update({
          client_modified_data: modifiedPlanData
        })
        .eq('id', planId)
        .select()
        .single();

      if (retryError) {
        console.error('Retry also failed:', retryError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to save modifications',
            details: retryError.message,
            hint: 'You may need to add client_modified_data column to coach_meal_plans table'
          })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: true,
          message: 'Client modifications saved',
          plan: retryData
        })
      };
    }

    if (error) {
      console.error('Update error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save modifications',
          details: error.message
        })
      };
    }

    console.log(`Client ${clientId} modified plan ${planId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Client modifications saved',
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
