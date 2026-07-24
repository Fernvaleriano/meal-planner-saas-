const { createClient } = require('@supabase/supabase-js');
const { verifyRequestUser, userBelongsToCoach } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Authorize a single storage path for the authenticated user. The second path
// segment identifies ownership:
//   exercise-videos/<coachId>/…, voice-notes/<coachId>/…,
//   meal-voice-notes/<coachId>/…  → the coach, their trainers, or their clients
//   client-voice-notes/<clientId>/… → that client, their coach, or their trainer
async function authorizeAssetPath(supabase, user, filePath) {
  const parts = filePath.split('/');
  const prefix = parts[0] + '/';
  const scopeId = parts[1];
  if (!scopeId) return false;

  if (prefix === 'client-voice-notes/') {
    const { data: client } = await supabase
      .from('clients')
      .select('id, user_id, coach_id, trainer_id')
      .eq('id', scopeId)
      .maybeSingle();
    if (!client) return false;
    if (client.user_id === user.id) return true;
    if (client.coach_id === user.id) return true;
    if (client.trainer_id != null) {
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

  // exercise-videos / voice-notes / meal-voice-notes → scopeId is the coach id
  return userBelongsToCoach(supabase, user.id, scopeId);
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Signed URL expiry: 24 hours (in seconds)
const SIGNED_URL_EXPIRY = 24 * 60 * 60;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Require a valid session, then authorize EVERY path against that user.
    // Previously the ownership check was gated on `if (coachId && ...)`, so
    // omitting coachId skipped it entirely — an anonymous caller could sign any
    // asset path (and client-voice-notes were never checked at all).
    const { user, error: authError } = await verifyRequestUser(event);
    if (authError) return authError;

    const { filePaths, coachId } = JSON.parse(event.body || '{}');

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'filePaths array is required' })
      };
    }

    // Generate signed URLs for each file path
    const signedUrls = {};

    // Collect custom video names for thumbnail lookup
    const customVideoNames = [];

    for (const filePath of filePaths) {
      // Security: Only allow access to exercise-videos, voice-notes, meal-voice-notes, and client-voice-notes folders
      const allowedPrefixes = ['exercise-videos/', 'voice-notes/', 'meal-voice-notes/', 'client-voice-notes/'];
      if (!allowedPrefixes.some(prefix => filePath.startsWith(prefix))) {
        continue;
      }

      // Ownership is derived from the authenticated user + the path itself
      // (NOT a client-supplied coachId), so a caller can only sign assets they
      // are actually entitled to.
      const ok = await authorizeAssetPath(supabase, user, filePath);
      if (!ok) continue;

      const { data, error } = await supabase.storage
        .from('workout-assets')
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

      if (!error && data?.signedUrl) {
        signedUrls[filePath] = data.signedUrl;
      }

      // Track custom video file names for thumbnail lookup
      if (filePath.startsWith('exercise-videos/')) {
        const fileName = filePath.split('/').pop();
        customVideoNames.push({ filePath, fileName });
      }
    }

    // Look up thumbnails for custom videos
    const thumbnailUrls = {};
    if (customVideoNames.length > 0 && coachId) {
      const thumbFolder = `video-thumbnails/${coachId}`;
      const { data: thumbFiles } = await supabase.storage
        .from('exercise-thumbnails')
        .list(thumbFolder, { limit: 200 });

      if (thumbFiles && thumbFiles.length > 0) {
        const thumbMap = new Map();
        thumbFiles.forEach(f => {
          if (f.name === 'metadata.json') return;
          const baseName = f.name.replace(/\.\w+$/, '');
          thumbMap.set(baseName, f.name);
        });

        for (const { filePath, fileName } of customVideoNames) {
          const videoBaseName = fileName.replace(/\.\w+$/, '');
          const thumbFileName = thumbMap.get(videoBaseName);
          if (thumbFileName) {
            const { data: tUrl } = supabase.storage
              .from('exercise-thumbnails')
              .getPublicUrl(`${thumbFolder}/${thumbFileName}`);
            if (tUrl?.publicUrl) {
              thumbnailUrls[filePath] = tUrl.publicUrl;
            }
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        signedUrls,
        thumbnailUrls,
        expiresIn: SIGNED_URL_EXPIRY
      })
    };

  } catch (err) {
    console.error('Get signed URLs error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
