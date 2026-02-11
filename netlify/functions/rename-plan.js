// Netlify Function to rename a meal plan
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { planId, coachId, newName } = JSON.parse(event.body);

    if (!planId || !coachId || !newName || !newName.trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Plan ID, Coach ID, and a non-empty name are required' })
      };
    }

    const trimmedName = newName.trim().substring(0, 255);

    // Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // First, get the current plan to update planName inside plan_data
    const { data: currentPlan, error: fetchError } = await supabase
      .from('coach_meal_plans')
      .select('plan_data')
      .eq('id', planId)
      .eq('coach_id', coachId)
      .single();

    if (fetchError || !currentPlan) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Plan not found or you do not have permission to rename it' })
      };
    }

    // Update planName inside plan_data JSONB as well
    const updatedPlanData = { ...currentPlan.plan_data, planName: trimmedName };

    const { data, error } = await supabase
      .from('coach_meal_plans')
      .update({
        plan_name: trimmedName,
        plan_data: updatedPlanData,
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to rename plan', details: error.message })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Plan not found or you do not have permission to rename it' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        planId: data.id,
        planName: data.plan_name,
        message: 'Plan renamed successfully'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};
