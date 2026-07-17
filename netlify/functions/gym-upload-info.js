const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

/**
 * gym-upload-info  (public, no auth)
 *
 * Given a gym's coach id (?g=<id>, the same non-secret id used in branded
 * login links), returns just the gym's display name so the drop-off page can
 * show "Uploading videos for <Gym>". Verifies the id really is a gym account —
 * a normal coach id is rejected, so the page can only ever collect clips for a
 * real gym. Reveals nothing beyond the public brand name.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    let coachId = (event.queryStringParameters?.g || '').trim();
    if (!coachId && event.body) {
      try { coachId = (JSON.parse(event.body).coachId || '').trim(); } catch (e) { /* ignore */ }
    }
    if (!coachId) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing gym id' }) };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: gym, error } = await supabase
      .from('coaches')
      .select('id, is_gym, name, brand_name, brand_app_name')
      .eq('id', coachId)
      .maybeSingle();

    if (error || !gym || !gym.is_gym) {
      return { statusCode: 404, headers, body: JSON.stringify({ valid: false, error: 'This upload link isn’t valid.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        gymName: (gym.brand_app_name || gym.brand_name || gym.name || 'Your Gym').trim()
      })
    };
  } catch (err) {
    console.error('gym-upload-info error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
