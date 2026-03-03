// Netlify Function for tracking water intake
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      const { clientId, date, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const targetDate = getDefaultDate(date, timezone);

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
      const { clientId, glasses, date, action, timezone } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const targetDate = getDefaultDate(date, timezone);
      const goal = 8;
      let newGlasses = 0;

      if (action === 'add' || action === 'remove' || action === 'complete') {
        // For relative actions, read the current value first
        const { data: existing } = await supabase
          .from('water_intake')
          .select('glasses')
          .eq('client_id', clientId)
          .eq('date', targetDate)
          .single();

        const current = existing?.glasses || 0;
        if (action === 'add') {
          newGlasses = Math.min(goal, current + (glasses || 1));
        } else if (action === 'remove') {
          newGlasses = Math.max(0, current - (glasses || 1));
        } else {
          newGlasses = goal;
        }
      } else if (glasses !== null && glasses !== undefined) {
        // Direct/absolute value — the client already computed the value
        const parsedGlasses = typeof glasses === 'string' ? parseInt(glasses, 10) : glasses;
        if (!isNaN(parsedGlasses)) {
          newGlasses = Math.max(0, Math.min(goal, parsedGlasses));
        }
      }

      // Atomic upsert — eliminates race condition when concurrent requests
      // both try to INSERT for the same (client_id, date)
      const { data: intake, error } = await supabase
        .from('water_intake')
        .upsert(
          {
            client_id: clientId,
            date: targetDate,
            glasses: newGlasses,
            goal: goal,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'client_id,date' }
        )
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          glasses: intake?.glasses ?? newGlasses,
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
