// Netlify Function for tracking water intake
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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch water intake for a date
    if (event.httpMethod === 'GET') {
      const { clientId, date } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const targetDate = date || new Date().toISOString().split('T')[0];

      const { data: intake, error } = await supabase
        .from('water_intake')
        .select('*')
        .eq('client_id', clientId)
        .eq('date', targetDate)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          glasses: intake?.glasses || 0,
          goal: intake?.goal || 8,
          date: targetDate
        })
      };
    }

    // POST - Update water intake (add/remove glasses)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, glasses, date, action } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const targetDate = date || new Date().toISOString().split('T')[0];

      // Get current intake
      const { data: existing } = await supabase
        .from('water_intake')
        .select('*')
        .eq('client_id', clientId)
        .eq('date', targetDate)
        .single();

      let newGlasses = 0;
      const goal = 8;

      if (action === 'add') {
        newGlasses = Math.min(goal, (existing?.glasses || 0) + (glasses || 1));
      } else if (action === 'remove') {
        newGlasses = Math.max(0, (existing?.glasses || 0) - (glasses || 1));
      } else if (action === 'complete') {
        newGlasses = goal;
      } else if (typeof glasses === 'number') {
        newGlasses = Math.max(0, Math.min(goal, glasses));
      }

      // Upsert the water intake
      const { data: intake, error } = await supabase
        .from('water_intake')
        .upsert({
          client_id: clientId,
          date: targetDate,
          glasses: newGlasses,
          goal: goal,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'client_id,date'
        })
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          glasses: intake?.glasses || newGlasses,
          goal: goal
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Water intake error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
