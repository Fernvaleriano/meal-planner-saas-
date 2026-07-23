// Netlify Function to rename a meal plan
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateGymMember, trainerClientIdScope, trainerCan, trainerPermissionResponse, corsHeaders } = require('./utils/auth');

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

    // Verify the authenticated user is the gym owner OR one of that gym's
    // active trainers. Owners are unchanged; a trainer is gated below.
    const _ctx = await authenticateGymMember(event, coachId);
    const { user, error: authError } = _ctx;
    if (authError) return authError;
    // Permission toggle: a trainer whose gym switched off meal-plan editing is
    // blocked here. Owners (and legacy coaches) always pass.
    if (!trainerCan(_ctx, 'write_meal_plans')) return trainerPermissionResponse('editing meal plans');

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // Trainer scope (null for owners/legacy → no gating): look up this plan's
    // client_id and confirm it's one of the trainer's assigned clients; fail
    // closed if the plan can't be resolved to an in-scope client.
    const _s = await trainerClientIdScope(event, supabase, coachId, _ctx);
    if (_s) {
      const { data: _planRow } = await supabase
        .from('coach_meal_plans')
        .select('client_id')
        .eq('id', planId)
        .eq('coach_id', coachId)
        .single();
      if (!_planRow || !_s.map(String).includes(String(_planRow.client_id))) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Not authorized for this client' })
        };
      }
    }

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
