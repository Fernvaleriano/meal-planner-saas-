const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (event.httpMethod === 'GET') {
      const clientId = event.queryStringParameters?.clientId;

      const { data, error } = await supabase
        .from('client_checkins')
        .select('*')
        .eq('client_id', clientId)
        .limit(10);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ checkins: data || [], stats: {} })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      const { data, error } = await supabase
        .from('client_checkins')
        .insert([{
          client_id: body.clientId,
          coach_id: body.coachId,
          checkin_date: new Date().toISOString().split('T')[0],
          energy_level: body.energyLevel,
          sleep_quality: body.sleepQuality,
          hunger_level: body.hungerLevel,
          stress_level: body.stressLevel,
          meal_plan_adherence: body.mealPlanAdherence,
          wins: body.wins,
          challenges: body.challenges,
          questions: body.questions
        }]);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
