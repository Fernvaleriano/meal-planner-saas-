const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

      // If no goals exist, use gender-based defaults
      let defaultGoals = goals;
      if (!goals) {
        // Fetch client's gender for gender-based defaults
        const { data: client } = await supabase
          .from('clients')
          .select('gender')
          .eq('id', clientId)
          .single();

        const isMale = client?.gender === 'male';
        // Male: 2500 cal, Female: 2000 cal (using 30/40/30 macro split)
        defaultGoals = isMale ? {
          calorie_goal: 2500,
          protein_goal: 188,  // (2500 * 0.30) / 4
          carbs_goal: 250,    // (2500 * 0.40) / 4
          fat_goal: 83,       // (2500 * 0.30) / 9
          fiber_goal: 30
        } : {
          calorie_goal: 2000,
          protein_goal: 150,  // (2000 * 0.30) / 4
          carbs_goal: 200,    // (2000 * 0.40) / 4
          fat_goal: 67,       // (2000 * 0.30) / 9
          fiber_goal: 25
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          goals: defaultGoals
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

      // If no coachId, this is a client request - check permission
      if (!coachId) {
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('can_edit_goals')
          .eq('id', clientId)
          .single();

        if (clientError) {
          console.error('Error checking client permission:', clientError);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to verify permissions' })
          };
        }

        if (!client || !client.can_edit_goals) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: 'You do not have permission to edit goals. Please contact your coach.' })
          };
        }
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
        // Insert new - use gender-based defaults if no values provided
        let defaults = { calorie: 2000, protein: 150, carbs: 200, fat: 67 };
        if (!calorieGoal || !proteinGoal || !carbsGoal || !fatGoal) {
          const { data: client } = await supabase
            .from('clients')
            .select('gender')
            .eq('id', clientId)
            .single();

          if (client?.gender === 'male') {
            defaults = { calorie: 2500, protein: 188, carbs: 250, fat: 83 };
          }
        }

        const { data, error } = await supabase
          .from('calorie_goals')
          .insert([{
            client_id: clientId,
            coach_id: coachId,
            calorie_goal: calorieGoal || defaults.calorie,
            protein_goal: proteinGoal || defaults.protein,
            carbs_goal: carbsGoal || defaults.carbs,
            fat_goal: fatGoal || defaults.fat,
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
