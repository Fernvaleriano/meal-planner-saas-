const { createClient } = require('@supabase/supabase-js');
const { verifyRequestUser, userBelongsToCoach } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Short-lived signed URL (1 hour) - generated fresh on every request
const SIGNED_URL_EXPIRY = 60 * 60;

// Allowed path prefixes for security
const ALLOWED_PREFIXES = ['voice-notes/', 'meal-voice-notes/', 'client-voice-notes/'];

// Decide whether `user` may listen to the voice note at `filePath`. Ownership
// is derived from the storage path convention:
//   voice-notes/<coachId>/...      → the coach's exercise voice note
//   meal-voice-notes/<coachId>/... → the coach's meal-plan voice note
//     (either is playable by that coach, their trainers, or their clients)
//   client-voice-notes/<clientId>/... → a client's own recording
//     (playable by that client, their coach, or their assigned trainer)
async function isAuthorizedForVoiceNote(supabase, user, filePath) {
  const parts = filePath.split('/');
  const prefix = parts[0] + '/';
  const scopeId = parts[1];
  if (!scopeId) return false;

  if (prefix === 'voice-notes/' || prefix === 'meal-voice-notes/') {
    // scopeId is the coach's UUID.
    return userBelongsToCoach(supabase, user.id, scopeId);
  }

  if (prefix === 'client-voice-notes/') {
    // scopeId is the client's integer id — this is a personal recording, so
    // only that client, their coach, or their assigned trainer may play it
    // (NOT every client of the coach).
    const { data: client } = await supabase
      .from('clients')
      .select('id, user_id, coach_id, trainer_id')
      .eq('id', scopeId)
      .maybeSingle();
    if (!client) return false;
    if (client.user_id === user.id) return true;      // the client
    if (client.coach_id === user.id) return true;      // their coach
    if (client.trainer_id != null) {                   // their assigned trainer
      const { data: trainerRow } = await supabase
        .from('gym_trainers')
        .select('id')
        .eq('trainer_user_id', user.id)
        .eq('gym_coach_id', client.coach_id)
        .eq('status', 'active')
        .maybeSingle();
      if (trainerRow && String(trainerRow.id) === String(client.trainer_id)) return true;
    }
    return false;
  }

  return false;
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const filePath = event.queryStringParameters?.path;
  if (!filePath) {
    return { statusCode: 400, body: 'Missing path parameter' };
  }

  // Security: only allow voice note paths
  if (!ALLOWED_PREFIXES.some(prefix => filePath.startsWith(prefix))) {
    return { statusCode: 403, body: 'Access denied' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: 'Server configuration error' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Authorize the caller BEFORE minting a signed URL. The token arrives in the
    // Authorization header (fetch-based players) or a ?token= query param
    // (<audio>/<a> elements that can't set headers). Anonymous callers used to
    // get a signed URL to any voice note under these folders.
    const { user, error: authError } = await verifyRequestUser(event);
    if (authError) return { statusCode: authError.statusCode, body: 'Unauthorized' };
    const allowed = await isAuthorizedForVoiceNote(supabase, user, filePath);
    if (!allowed) {
      return { statusCode: 403, body: 'Access denied' };
    }

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error('serve-voice-note: signed URL error:', error?.message);
      return { statusCode: 404, body: 'Voice note not found' };
    }

    // 302 redirect to the fresh signed URL
    return {
      statusCode: 302,
      headers: {
        'Location': data.signedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
      body: ''
    };
  } catch (err) {
    console.error('serve-voice-note error:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
