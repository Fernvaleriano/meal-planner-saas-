// Netlify Function to update coach notes on a meal plan
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
        'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { planId, coachId, notes, planData } = body;

    if (!planId || !coachId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Plan ID and Coach ID are required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the coach owns this plan
    const { data: plan, error: fetchError } = await supabase
      .from('coach_meal_plans')
      .select('id, coach_id')
      .eq('id', planId)
      .single();

    if (fetchError || !plan) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Plan not found' })
      };
    }

    if (plan.coach_id !== coachId) {
      return {
        statusCode: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Not authorized to edit this plan' })
      };
    }

    // Build update object - can update notes, planData, or both
    const updateObj = {};
    if (notes !== undefined) {
      updateObj.coach_notes = notes || null;
    }
    if (planData !== undefined) {
      updateObj.plan_data = planData;
    }

    // Check if there's anything to update
    if (Object.keys(updateObj).length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No data to update' })
      };
    }

    // Update the plan (don't use .single() as it can fail on some updates)
    const { data, error } = await supabase
      .from('coach_meal_plans')
      .update(updateObj)
      .eq('id', planId)
      .select();

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to update notes: ' + error.message })
      };
    }

    if (!data || data.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Plan not found or update failed' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, plan: data[0] })
    };

  } catch (error) {
    console.error('Error updating notes:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
