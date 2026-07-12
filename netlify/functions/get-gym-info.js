/**
 * Get Gym Info
 *
 * Public-ish read of a coach/gym's gym_info (hours of operation, member
 * classes, socials) for the client app to display. Returns only the
 * gym_info blob — no member data. Mirrors get-coach-branding.js: callable
 * with ?coachId= (client portals) or a Bearer token (the coach themself).
 *
 * Additive and isolated — does not touch branding or any existing endpoint.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let coachId = event.queryStringParameters?.coachId;
    if (!coachId) {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (user) coachId = user.id;
      }
    }
    if (!coachId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Coach ID required' }) };
    }

    const { data: coach, error } = await supabase
      .from('coaches')
      .select('gym_info')
      .eq('id', coachId)
      .single();

    if (error) {
      console.error('get-gym-info fetch error:', error);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Coach not found' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ gym_info: coach.gym_info || null }) };
  } catch (err) {
    console.error('get-gym-info error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
