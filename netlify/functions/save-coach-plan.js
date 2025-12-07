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

    const { coachId, clientName, planData, clientId, planId, planName } = JSON.parse(event.body);

    console.log('📝 Saving plan for coach:', coachId, 'client:', clientName, 'clientId:', clientId, 'planId:', planId, 'planName:', planName);

    if (!coachId || !planData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and plan data are required' })
      };
    }

    // Initialize Supabase client with service key (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    let data, error;

    // If planId exists, UPDATE the existing plan instead of creating a new one
    if (planId) {
      console.log('📝 Updating existing plan:', planId);

      const updateData = {
        plan_data: planData,
        client_name: clientName || 'Unnamed Client',
        updated_at: new Date().toISOString()
      };

      // Add plan_name if provided
      if (planName) {
        updateData.plan_name = planName;
      }

      // NOTE: client_id is intentionally NOT included to avoid foreign key issues
      // Plans are linked to clients via client_name instead

      let result = await supabase
        .from('coach_meal_plans')
        .update(updateData)
        .eq('id', planId)
        .eq('coach_id', coachId) // Ensure coach owns this plan
        .select()
        .single();

      data = result.data;
      error = result.error;

      if (error) {
        console.error('❌ Update error:', error);
      } else {
        console.log('✅ Plan updated successfully:', planId);
      }
    } else {
      // No planId - INSERT a new plan
      console.log('📝 Creating new plan');

      // Prepare insert data
      // NOTE: client_id is intentionally NOT included to avoid foreign key issues
      const insertData = {
        coach_id: coachId,
        client_name: clientName || 'Unnamed Client',
        plan_data: planData,
        created_at: new Date().toISOString()
      };

      // Add plan_name if provided
      if (planName) {
        insertData.plan_name = planName;
      }

      // Try to insert
      let result = await supabase
        .from('coach_meal_plans')
        .insert([insertData])
        .select()
        .single();

      data = result.data;
      error = result.error;

      if (error) {
        console.error('❌ Insert error:', JSON.stringify(error));
      }
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
        planName: data.plan_name || null,
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
