// Netlify Function to delete a coach's meal plan
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateGymMember, trainerClientIdScope, trainerCan, trainerPermissionResponse, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const planId = event.queryStringParameters.planId;
    const coachId = event.queryStringParameters.coachId;

    if (!planId || !coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Plan ID and Coach ID are required' })
      };
    }

    // ✅ SECURITY: allow the gym owner OR one of that gym's active trainers.
    // Owners are unchanged. This plan is bound to a client, so a trainer may
    // only delete a plan belonging to a client assigned to them.
    const ctx = await authenticateGymMember(event, coachId);
    if (ctx.error) return ctx.error;
    // Permission toggle: a trainer whose gym switched off meal-plan editing is
    // blocked here. Owners (and legacy coaches) always pass.
    if (!trainerCan(ctx, 'write_meal_plans')) return trainerPermissionResponse('editing meal plans');

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Trainer scope (null for owners/legacy → no gating). Look up this plan's
    // client_id and confirm it's one of the trainer's assigned clients; fail
    // closed if the plan can't be resolved to an in-scope client.
    const _scope = await trainerClientIdScope(event, supabase, coachId);
    if (_scope) {
      const { data: planRow } = await supabase
        .from('coach_meal_plans')
        .select('client_id')
        .eq('id', planId)
        .eq('coach_id', coachId)
        .single();
      if (!planRow || !_scope.map(String).includes(String(planRow.client_id))) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Not authorized to access this client' })
        };
      }
    }

    // First, delete any associated shared plans
    // This ensures clients lose access to the shared link
    const { error: sharedError } = await supabase
      .from('shared_meal_plans')
      .delete()
      .eq('coach_plan_id', planId);

    if (sharedError) {
      console.warn('Warning: Could not delete shared plans:', sharedError.message);
      // Continue with coach plan deletion even if shared plan deletion fails
    } else {
    }

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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
