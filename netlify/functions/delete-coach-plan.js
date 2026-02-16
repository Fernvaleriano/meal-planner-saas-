// Netlify Function to delete a coach's meal plan
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL;
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

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔐 Authenticated coach ${user.id} deleting plan ${planId}`);

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
      console.log('Associated shared plans deleted for plan:', planId);
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

    console.log('Coach plan deleted:', planId);

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
