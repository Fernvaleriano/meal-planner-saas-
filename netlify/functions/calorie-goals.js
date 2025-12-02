const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch goals for a client
    if (event.httpMethod === 'GET') {
      const { clientId } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const { data: goals, error } = await supabase
        .from('calorie_goals')
        .select('*')
        .eq('client_id', clientId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Return default goals if none exist
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          goals: goals || {
            calorie_goal: 2000,
            protein_goal: 150,
            carbs_goal: 200,
            fat_goal: 65,
            fiber_goal: 25
          }
        })
      };
    }

    // POST/PUT - Create or update goals
    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const {
        clientId,
        coachId,
        calorieGoal,
        proteinGoal,
        carbsGoal,
        fatGoal,
        fiberGoal,
        sugarGoal,
        sodiumGoal
      } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      // Check if goals already exist
      const { data: existing } = await supabase
        .from('calorie_goals')
        .select('id')
        .eq('client_id', clientId)
        .single();

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('calorie_goals')
          .update({
            calorie_goal: calorieGoal,
            protein_goal: proteinGoal,
            carbs_goal: carbsGoal,
            fat_goal: fatGoal,
            fiber_goal: fiberGoal || null,
            sugar_goal: sugarGoal || null,
            sodium_goal: sodiumGoal || null
          })
          .eq('client_id', clientId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('calorie_goals')
          .insert([{
            client_id: clientId,
            coach_id: coachId,
            calorie_goal: calorieGoal || 2000,
            protein_goal: proteinGoal || 150,
            carbs_goal: carbsGoal || 200,
            fat_goal: fatGoal || 65,
            fiber_goal: fiberGoal || null,
            sugar_goal: sugarGoal || null,
            sodium_goal: sodiumGoal || null
          }])
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, goals: result })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Calorie goals error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
