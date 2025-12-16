// Netlify Function to save a coach's meal plan
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  console.log('🔵 save-coach-plan function invoked');

  // Handle CORS preflight requests
  const corsResponse = handleCors(event);
  if (corsResponse) {
    console.log('✅ CORS preflight handled');
    return corsResponse;
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log('❌ Invalid method:', event.httpMethod);
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

    // Log request body size
    const bodySize = event.body ? event.body.length : 0;
    console.log(`📦 Request body size: ${(bodySize / 1024).toFixed(2)} KB`);

    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError.message);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { coachId, clientName, planData, clientId, planId, planName } = parsedBody;

    console.log('📝 Saving plan for coach:', coachId, 'client:', clientName, 'clientId:', clientId, 'planId:', planId, 'planName:', planName);

    if (!coachId || !planData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and plan data are required' })
      };
    }

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔐 Authenticated coach ${user.id} saving meal plan`);

    // Initialize Supabase client with service key (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    let data, error;

    // If planId exists, UPDATE the existing plan instead of creating a new one
    if (planId) {
      console.log('📝 Updating existing plan:', planId);

      // First try with client_id
      const updateData = {
        plan_data: planData,
        client_name: clientName || 'Unnamed Client',
        updated_at: new Date().toISOString()
      };

      if (planName) {
        updateData.plan_name = planName;
      }

      if (clientId) {
        updateData.client_id = clientId;
      }

      let result = await supabase
        .from('coach_meal_plans')
        .update(updateData)
        .eq('id', planId)
        .eq('coach_id', coachId)
        .select()
        .single();

      data = result.data;
      error = result.error;

      // If any error and we included client_id, retry without it
      if (error && clientId) {
        console.log('⚠️ Update failed with client_id, retrying without it. Error:', error.message);
        delete updateData.client_id;
        result = await supabase
          .from('coach_meal_plans')
          .update(updateData)
          .eq('id', planId)
          .eq('coach_id', coachId)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('❌ Update error:', error);
      } else {
        console.log('✅ Plan updated successfully:', planId);
      }
    } else {
      // No planId - INSERT a new plan
      console.log('📝 Creating new plan');

      const insertData = {
        coach_id: coachId,
        client_name: clientName || 'Unnamed Client',
        plan_data: planData,
        created_at: new Date().toISOString()
      };

      if (planName) {
        insertData.plan_name = planName;
      }

      if (clientId) {
        insertData.client_id = clientId;
      }

      // Try to insert
      let result = await supabase
        .from('coach_meal_plans')
        .insert([insertData])
        .select()
        .single();

      data = result.data;
      error = result.error;

      // If any error and we included client_id, retry without it
      if (error && clientId) {
        console.log('⚠️ Insert failed with client_id, retrying without it. Error:', error.message);
        delete insertData.client_id;
        result = await supabase
          .from('coach_meal_plans')
          .insert([insertData])
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('❌ Insert error:', error);
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
        status: data.status || 'draft',
        message: 'Plan saved successfully.'
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
