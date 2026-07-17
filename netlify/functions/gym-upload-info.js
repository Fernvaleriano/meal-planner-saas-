const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// The admin account can use its own drop-off link to practice/test the flow,
// even though it isn't a gym.
const MASTER_EMAIL = 'contact@ziquefitness.com';

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
    const qp = event.queryStringParameters || {};
    let coachId = (qp.g || '').trim();
    let code = (qp.code || qp.c || '').trim();
    if (event.body) {
      try {
        const b = JSON.parse(event.body);
        if (!coachId) coachId = (b.coachId || '').trim();
        if (!code) code = (b.code || '').trim();
      } catch (e) { /* ignore */ }
    }
    if (!coachId) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing gym id' }) };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: gym, error } = await supabase
      .from('coaches')
      .select('id, is_gym, email, name, brand_name, brand_app_name, video_upload_code')
      .eq('id', coachId)
      .maybeSingle();

    const isPracticeAdmin = (gym?.email || '').toLowerCase() === MASTER_EMAIL;
    if (error || !gym || (!gym.is_gym && !isPracticeAdmin)) {
      return { statusCode: 404, headers, body: JSON.stringify({ valid: false, error: 'This upload link isn’t valid.' }) };
    }

    const norm = (s) => (s || '').trim().toUpperCase();
    const needsCode = !!(gym.video_upload_code && gym.video_upload_code.trim());
    // Only report codeOk when a code was actually supplied to check.
    const codeOk = !needsCode ? true : (code ? norm(code) === norm(gym.video_upload_code) : false);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        gymName: (gym.brand_app_name || gym.brand_name || gym.name || 'Your Gym').trim(),
        needsCode,
        codeOk
      })
    };
  } catch (err) {
    console.error('gym-upload-info error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
