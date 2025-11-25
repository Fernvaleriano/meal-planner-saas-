// Netlify Function to save client check-ins
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: ''
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // GET - Fetch check-ins for a client
  if (event.httpMethod === 'GET') {
    const clientId = event.queryStringParameters?.clientId;
    const limit = event.queryStringParameters?.limit || 10;

    if (!clientId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID is required' })
      };
    }

    try {
      const { data: checkins, error } = await supabase
        .from('client_checkins')
        .select('*')
        .eq('client_id', clientId)
        .order('checkin_date', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw error;

      // Calculate stats
      let stats = {
        totalCheckins: checkins?.length || 0,
        currentStreak: 0,
        averageAdherence: null
      };

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkins: checkins || [], stats })
      };

    } catch (error) {
      console.error('Error fetching check-ins:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to fetch check-ins', details: error.message })
      };
    }
  }

  // POST - Save a new check-in
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { clientId, coachId, energyLevel, sleepQuality, hungerLevel, stressLevel, mealPlanAdherence, wins, challenges, questions } = body;

      if (!clientId || !coachId) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
        };
      }

      const { data, error } = await supabase
        .from('client_checkins')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          checkin_date: new Date().toISOString().split('T')[0],
          energy_level: energyLevel || null,
          sleep_quality: sleepQuality || null,
          hunger_level: hungerLevel || null,
          stress_level: stressLevel || null,
          meal_plan_adherence: mealPlanAdherence || null,
          wins: wins || null,
          challenges: challenges || null,
          questions: questions || null
        }]);

      if (error) throw error;

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Check-in saved successfully' })
      };

    } catch (error) {
      console.error('Error saving check-in:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to save check-in', details: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
