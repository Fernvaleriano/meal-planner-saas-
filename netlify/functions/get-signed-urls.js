const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    const { filePaths, coachId, clientId } = JSON.parse(event.body || '{}');

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'filePaths array is required' })
      };
    }

    // Validate that the client belongs to the coach (if clientId provided)
    if (clientId && coachId) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('coach_id')
        .eq('id', clientId)
        .single();

      if (clientError || !clientData || clientData.coach_id !== coachId) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Access denied: Client does not belong to this coach' })
        };
      }
    }

    // Generate signed URLs for each file path
    const signedUrls = {};

    // Collect custom video names for thumbnail lookup
    const customVideoNames = [];

    for (const filePath of filePaths) {
      // Security: Only allow access to exercise-videos, voice-notes, and client-voice-notes folders
      if (!filePath.startsWith('exercise-videos/') && !filePath.startsWith('voice-notes/') && !filePath.startsWith('client-voice-notes/')) {
        continue;
      }

      // If coachId is provided, verify the file belongs to that coach
      // (skip ownership check for client-voice-notes which are organized by clientId)
      if (coachId && !filePath.startsWith('client-voice-notes/')) {
        const pathCoachId = filePath.split('/')[1];
        if (pathCoachId !== coachId) {
          continue; // Skip files not belonging to this coach
        }
      }

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
