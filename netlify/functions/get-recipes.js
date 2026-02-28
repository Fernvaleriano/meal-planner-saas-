// Netlify Function to get recipes for a client (from their coach)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { clientId, coachId } = event.queryStringParameters || {};

    if (!clientId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'clientId is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Try to fetch recipes from coach_recipes table if it exists
    const lookupCoachId = coachId || null;
    let recipes = [];

    if (lookupCoachId) {
      try {
        const { data, error } = await supabase
          .from('coach_recipes')
          .select('*')
          .eq('coach_id', lookupCoachId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          recipes = data;
        }
      } catch (e) {
        // Table may not exist yet - return empty recipes
        console.log('coach_recipes table not available:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipes })
    };

  } catch (error) {
    console.error('get-recipes error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
