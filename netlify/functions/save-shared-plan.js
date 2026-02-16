// Netlify Function to save a shared meal plan to Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { planData, coachPlanId } = JSON.parse(event.body);

    if (!planData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Plan data is required' })
      };
    }

    // Initialize Supabase client with service key for admin access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Generate a unique share ID (8 characters)
    const shareId = Math.random().toString(36).substring(2, 10);

    // Prepare insert data
    const insertData = {
      share_id: shareId,
      plan_data: planData,
      created_at: new Date().toISOString()
    };

    // Add coach_plan_id if provided (links shared plan to coach plan)
    if (coachPlanId) {
      insertData.coach_plan_id = coachPlanId;
    }

    // Insert the shared plan into the database
    const { data, error } = await supabase
      .from('shared_meal_plans')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save shared plan',
          details: error.message
        })
      };
    }

    // Generate the share URL
    const shareUrl = `${event.headers.origin || 'https://your-site.netlify.app'}/view-plan.html?share=${shareId}`;

    console.log('✅ Shared plan saved with ID:', shareId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        shareId,
        shareUrl,
        message: 'Plan saved successfully'
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
