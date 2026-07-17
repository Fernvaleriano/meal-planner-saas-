const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Where gyms drop their raw footage — a private holding area only the admin
// pulls from. Kept separate from exercise-videos/ so nothing here is ever live
// until the admin names/tags it and saves it into the gym's library.
const INBOX_ROOT = 'gym-video-inbox';
// The admin account may use its own inbox to practice/test the flow.
const MASTER_EMAIL = 'contact@ziquefitness.com';

function safeName(name) {
  return String(name || 'clip')
    .replace(/\.[^.]+$/, '')            // drop extension (re-added below)
    .replace(/[^a-zA-Z0-9]+/g, '-')     // collapse anything odd to a dash
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'clip';
}

/**
 * get-gym-upload-url  (public, no auth)
 *
 * A gym on the drop-off page asks for a place to upload one clip. We verify the
 * id is a real gym, then hand back a one-shot signed URL into that gym's inbox
 * folder. No account access, no library write — just a private drop box.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, fileName, contentType } = JSON.parse(event.body || '{}');
    if (!coachId || !fileName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId and fileName are required' }) };
    }
    if (contentType && !/^video\//i.test(contentType)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only video files can be uploaded here.' }) };
    }

    // Confirm the target really is a gym (or the admin practicing) before
    // letting anything land in it.
    const { data: gym } = await supabase.from('coaches').select('id, is_gym, email').eq('id', coachId).maybeSingle();
    const isPracticeAdmin = (gym?.email || '').toLowerCase() === MASTER_EMAIL;
    if (!gym || (!gym.is_gym && !isPracticeAdmin)) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'This upload link isn’t valid.' }) };
    }

    const extMatch = String(fileName).match(/\.([a-zA-Z0-9]{2,5})$/);
    const ext = (extMatch ? extMatch[1] : 'mp4').toLowerCase();
    // Timestamp keeps the original (readable) name but avoids collisions; the
    // admin inbox view strips the timestamp back off for display.
    const storedName = `${Date.now()}__${safeName(fileName)}.${ext}`;
    const filePath = `${INBOX_ROOT}/${coachId}/${storedName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workout-assets')
      .createSignedUploadUrl(filePath);

    if (uploadError) {
      if (/bucket|not found/i.test(uploadError.message)) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Storage not configured (workout-assets bucket missing).', details: uploadError.message }) };
      }
      throw uploadError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, uploadUrl: uploadData.signedUrl, filePath, contentType: contentType || 'video/mp4' })
    };
  } catch (err) {
    console.error('get-gym-upload-url error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
