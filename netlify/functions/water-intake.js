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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    console.error('[water] Missing SUPABASE_SERVICE_KEY');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    if (event.httpMethod === 'GET') {
      const { clientId, date, timezone } = event.queryStringParameters || {};
      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const targetDate = getDefaultDate(date, timezone);

      // Use .limit(1) instead of .single() — avoids errors with 0 or 2+ rows
      const { data: rows, error } = await supabase
        .from('water_intake')
        .select('glasses, goal')
        .eq('client_id', clientId)
        .eq('date', targetDate)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[water GET] DB error:', JSON.stringify(error));
        throw error;
      }

      const row = rows && rows.length > 0 ? rows[0] : null;

      // Fetch client's custom water goal and unit
      const { data: clientRows } = await supabase
        .from('clients')
        .select('water_goal, water_unit')
        .eq('id', clientId)
        .limit(1);
      const client = clientRows && clientRows.length > 0 ? clientRows[0] : null;
      const clientGoal = client?.water_goal || 8;
      const clientUnit = client?.water_unit || 'glasses';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          glasses: row?.glasses || 0,
          goal: clientGoal,
          unit: clientUnit,
          date: targetDate
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, glasses, date, action, timezone } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const targetDate = getDefaultDate(date, timezone);

      // Fetch client's custom water goal
      const { data: clientRows } = await supabase
        .from('clients')
        .select('water_goal')
        .eq('id', clientId)
        .limit(1);
      const clientData = clientRows && clientRows.length > 0 ? clientRows[0] : null;
      const goal = clientData?.water_goal || 8;
      let newGlasses = 0;

      // Check for existing row (use .limit(1) — never .single())
      const { data: existingRows, error: lookupErr } = await supabase
        .from('water_intake')
        .select('id, glasses')
        .eq('client_id', clientId)
        .eq('date', targetDate)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (lookupErr) {
        console.error('[water POST] Lookup error:', JSON.stringify(lookupErr));
        throw lookupErr;
      }

      const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

      // Calculate the new value. We also track what the raw (uncapped) intent
      // was so we can report back to the client if their input got clamped
      // at the goal (previously this was silent, so users who over-drank
      // never saw their extra glasses reflected or got any feedback).
      let requestedGlasses = null;
      if (action === 'add') {
        requestedGlasses = (existing?.glasses || 0) + (glasses || 1);
        newGlasses = Math.min(goal, requestedGlasses);
      } else if (action === 'remove') {
        requestedGlasses = (existing?.glasses || 0) - (glasses || 1);
        newGlasses = Math.max(0, requestedGlasses);
      } else if (action === 'complete') {
        requestedGlasses = goal;
        newGlasses = goal;
      } else if (glasses !== null && glasses !== undefined) {
        const parsed = typeof glasses === 'string' ? parseInt(glasses, 10) : glasses;
        if (!isNaN(parsed)) {
          requestedGlasses = parsed;
          newGlasses = Math.max(0, Math.min(goal, parsed));
        }
      }

      const capped = requestedGlasses !== null && requestedGlasses > newGlasses;
      const droppedAtGoal = capped ? requestedGlasses - newGlasses : 0;

      if (existing) {
        // UPDATE by primary key
        const { error: updateErr } = await supabase
          .from('water_intake')
          .update({ glasses: newGlasses, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (updateErr) {
          console.error('[water POST] Update error:', JSON.stringify(updateErr));
          throw updateErr;
        }
      } else {
        // INSERT new row
        const { error: insertErr } = await supabase
          .from('water_intake')
          .insert({
            client_id: clientId,
            date: targetDate,
            glasses: newGlasses,
            goal: goal
          });

        if (insertErr) {
          console.error('[water POST] Insert error:', JSON.stringify(insertErr));
          throw insertErr;
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, glasses: newGlasses, goal, capped, droppedAtGoal })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[water] Unhandled error:', err.message, err.code, err.details);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
