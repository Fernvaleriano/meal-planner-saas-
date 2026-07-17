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

// Turn "1699999999999__Barbell-Back-Squat.mp4" back into "Barbell Back Squat"
function displayName(storedName) {
  return String(storedName || '')
    .replace(/^\d+__/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/**
 * list-gym-inbox  (admin only)
 *
 * Lists the raw clips a gym has dropped into its inbox, with a short-lived
 * signed URL for each so the admin uploader can pull them in to name/tag/save.
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

    const { gymId } = JSON.parse(event.body || '{}');
    if (!gymId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'gymId required' }) };

    const folder = `${INBOX_ROOT}/${gymId}`;
    const { data: objects, error: listErr } = await supabase.storage
      .from('workout-assets')
      .list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
    if (listErr) throw listErr;

    const clips = [];
    for (const obj of (objects || [])) {
      if (!obj.name || obj.id === null) continue;         // skip folder placeholders
      const path = `${folder}/${obj.name}`;
      const { data: signed } = await supabase.storage.from('workout-assets').createSignedUrl(path, 3600);
      clips.push({
        path,
        storedName: obj.name,
        name: displayName(obj.name),
        size: obj.metadata?.size || 0,
        url: signed?.signedUrl || null
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, clips }) };
  } catch (err) {
    console.error('list-gym-inbox error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
