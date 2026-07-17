const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MASTER_EMAIL = 'contact@ziquefitness.com';
const INBOX_ROOT = 'gym-video-inbox';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * delete-gym-inbox-file  (admin only)
 *
 * Removes one clip from a gym's inbox. Called by the admin uploader after a
 * clip has been successfully saved into the gym's library, so the inbox always
 * shows only what's still waiting. Hard-restricted to the inbox folder — it can
 * never touch a live exercise-videos path.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not signed in' }) };
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    if ((user.email || '').toLowerCase() !== MASTER_EMAIL) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden — admin only' }) };
    }

    const { path } = JSON.parse(event.body || '{}');
    if (!path || typeof path !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'path required' }) };
    }
    // Safety: only ever delete inside the inbox, never a live library video.
    if (!path.startsWith(`${INBOX_ROOT}/`) || path.includes('..')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Refusing to delete outside the gym inbox.' }) };
    }

    const { error } = await supabase.storage.from('workout-assets').remove([path]);
    if (error) throw error;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('delete-gym-inbox-file error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
