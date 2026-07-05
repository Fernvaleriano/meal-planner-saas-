// Netlify Function to retrieve a shared meal plan from Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const shareId = event.queryStringParameters.shareId;

    if (!shareId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Share ID is required' })
      };
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Retrieve the shared plan from the database
    const { data, error } = await supabase
      .from('shared_meal_plans')
      .select('plan_data, created_at, coach_plan_id')
      .eq('share_id', shareId)
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Shared plan not found',
          details: error.message
        })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Shared plan not found' })
      };
    }

    // Best-effort coach branding (mirrors get-shared-workout) so an anonymous
    // viewer of a shared plan sees the coach's brand instead of the platform's.
    // Never allowed to break plan loading — branding stays null on any failure.
    let coachBranding = null;
    if (data.coach_plan_id) {
      try {
        const { data: coachPlan } = await supabase
          .from('coach_meal_plans')
          .select('coach_id')
          .eq('id', data.coach_plan_id)
          .maybeSingle();
        if (coachPlan && coachPlan.coach_id) {
          const { data: branding } = await supabase
            .from('coaches')
            .select('brand_name, brand_logo_url, brand_primary_color, brand_secondary_color')
            .eq('id', coachPlan.coach_id)
            .maybeSingle();
          if (branding) {
            coachBranding = {
              displayName: branding.brand_name || null,
              logoUrl: branding.brand_logo_url || null,
              primaryColor: branding.brand_primary_color || null,
              secondaryColor: branding.brand_secondary_color || null
            };
          }
        }
      } catch (_e) { /* branding lookup is best-effort */ }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        planData: data.plan_data,
        createdAt: data.created_at,
        coachBranding
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
