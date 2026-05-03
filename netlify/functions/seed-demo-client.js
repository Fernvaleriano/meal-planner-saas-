// Netlify Function: Generate or reset a personal demo client for the
// authenticated coach. Used to populate a believable demo (gym check-ins,
// weigh-ins, profile photo) for showcasing the platform during sales/demos.
//
// POST body:
//   { coachId: string, action: 'seed' | 'reset' }
//
// 'seed' wipes any existing demo client for this coach and creates a fresh
// one with AI-generated photos and ~6 weeks of activity.
// 'reset' just wipes the existing demo client (without re-seeding).
//
// Note: Image generation can take 15–25 seconds. The Netlify function timeout
// may need to be raised in netlify.toml for this function (see comments below).

const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');
const { seedDemoClient, wipeDemoClient } = require('./utils/seed-demo-client-helper');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { coachId, action = 'seed' } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID is required' })
      };
    }

    if (!['seed', 'reset'].includes(action)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "action must be 'seed' or 'reset'" })
      };
    }

    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error: SUPABASE_SERVICE_KEY missing' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    let result;
    if (action === 'reset') {
      const { wiped } = await wipeDemoClient(supabase, coachId);
      result = {
        success: true,
        message: wiped > 0
          ? `Removed ${wiped} demo client${wiped === 1 ? '' : 's'}`
          : 'No demo client found to reset',
        wiped
      };
    } else {
      result = await seedDemoClient(supabase, coachId);
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('seed-demo-client error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        // Include the underlying message in `error` so the UI surfaces it
        // (apiPost only reads `data.error`, not `data.details`).
        error: `Failed to seed demo client: ${error.message}`,
        details: error.message,
        stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined
      })
    };
  }
};
