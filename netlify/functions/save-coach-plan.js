// Netlify Function to save a coach's meal plan
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Common CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Check for required environment variables
    if (!SUPABASE_SERVICE_KEY) {
      console.error('❌ SUPABASE_SERVICE_KEY is not configured');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error: Missing database credentials' })
      };
    }

    const { coachId, clientName, planData, clientId } = JSON.parse(event.body);

    console.log('📝 Saving plan for coach:', coachId, 'client:', clientName, 'clientId:', clientId);

    if (!coachId || !planData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and plan data are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Prepare insert data (status column may not exist in older schemas)
    const insertData = {
      coach_id: coachId,
      client_name: clientName || 'Unnamed Client',
      plan_data: planData,
      status: 'draft', // Plans start as draft until coach submits to client
      created_at: new Date().toISOString()
    };

    // Add client_id if provided
    if (clientId) {
      insertData.client_id = clientId;
    }

    // Try to insert with status column first
    let { data, error } = await supabase
      .from('coach_meal_plans')
      .insert([insertData])
      .select()
      .single();

    // If error mentions status column doesn't exist, retry without it
    if (error && (error.message.includes('status') || error.code === '42703')) {
      console.log('⚠️ Status column not found, retrying without it...');
      delete insertData.status;
      const retryResult = await supabase
        .from('coach_meal_plans')
        .insert([insertData])
        .select()
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Failed to save meal plan',
          details: error.message
        })
      };
    }

    console.log('✅ Meal plan saved with ID:', data.id);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        planId: data.id,
        status: data.status || 'draft', // Default to draft if status column doesn't exist
        message: 'Plan saved as draft. Use "Submit to Client" to make it visible.'
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
