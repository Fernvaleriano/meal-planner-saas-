const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
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

    for (const filePath of filePaths) {
      // Security: Only allow access to exercise-videos and voice-notes folders
      if (!filePath.startsWith('exercise-videos/') && !filePath.startsWith('voice-notes/')) {
        continue;
      }

      // If coachId is provided, verify the file belongs to that coach
      if (coachId) {
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
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        signedUrls,
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
