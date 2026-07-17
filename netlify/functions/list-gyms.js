const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Only this account may target other gyms' accounts with bulk uploads.
// Keep in lockstep with master-account-guard.js.
const MASTER_EMAIL = 'contact@ziquefitness.com';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * list-gyms
 *
 * Returns the gym accounts the admin can upload videos into, for the
 * bulk-video-upload picker. Locked to the master account only — a regular
 * coach or gym owner who calls this gets 403 and never sees other accounts.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // --- Verify the caller IS the master/admin account ---
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not signed in' }) };
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    if ((user.email || '').toLowerCase() !== MASTER_EMAIL) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden — admin only' }) };
    }

    // --- Fetch every gym account for the picker ---
    const { data: gyms, error } = await supabase
      .from('coaches')
      .select('id, email, name, brand_name, is_gym')
      .eq('is_gym', true);
    if (error) throw error;

    const list = (gyms || [])
      .map(g => ({
        id: g.id,
        email: g.email,
        label: (g.brand_name || g.name || g.email || 'Unnamed gym').trim()
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, gyms: list })
    };
  } catch (err) {
    console.error('list-gyms error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
