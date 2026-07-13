/**
 * Public (no-auth) lookup for a gym join code.
 * Given ?code=XXXX, returns just enough of the gym's branding to render a
 * branded join screen, plus whether the gym is full. Reveals no member data.
 *
 * A "gym" is a coach account; its join code lives in gym_join_codes.
 * Additive: does not touch any existing signup path.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const code = (event.queryStringParameters?.code || '').trim();
    if (!code) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing code' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up the active code (case-insensitive)
    const { data: gymCode, error: codeError } = await supabase
      .from('gym_join_codes')
      .select('coach_id, member_cap, is_active')
      .ilike('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (codeError || !gymCode) {
      return { statusCode: 404, headers, body: JSON.stringify({ valid: false, error: 'That code isn’t valid.' }) };
    }

    // Gym branding (from the coach account that IS the gym)
    const { data: gym } = await supabase
      .from('coaches')
      .select('brand_name, brand_app_name, brand_logo_url, brand_primary_color, brand_welcome_message')
      .eq('id', gymCode.coach_id)
      .single();

    // How many spots are left (exclude archived members)
    const { count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', gymCode.coach_id)
      .not('is_archived', 'is', true);

    const spotsLeft = Math.max(0, (gymCode.member_cap || 0) - (count || 0));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        // Coach id so the join page can send new members to the BRANDED
        // login (/app/login?coachId=...) — not secret, it's the same id
        // used in every branded login link.
        coachId: gymCode.coach_id,
        gymName: gym?.brand_app_name || gym?.brand_name || 'Your Gym',
        logoUrl: gym?.brand_logo_url || null,
        primaryColor: gym?.brand_primary_color || null,
        welcomeMessage: gym?.brand_welcome_message || null,
        full: spotsLeft <= 0
      })
    };
  } catch (error) {
    console.error('gym-code-info error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
  }
};
