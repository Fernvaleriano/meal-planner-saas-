const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Signed URL expiry: 7 days (in seconds)
const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60;

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
      body: JSON.stringify({ error: 'Server configuration error - SUPABASE_SERVICE_KEY not set' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, fileName, contentType, folder } = JSON.parse(event.body || '{}');

    if (!coachId || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId and fileName are required' })
      };
    }

    // Determine folder (exercise-videos or voice-notes)
    const folderPath = folder === 'voice-notes' ? 'voice-notes' : 'exercise-videos';
    const filePath = `${folderPath}/${coachId}/${fileName}`;

    // Create a signed upload URL
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workout-assets')
      .createSignedUploadUrl(filePath);

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError);

      // Check if bucket doesn't exist
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Storage not configured. Please create the "workout-assets" bucket in Supabase (keep it PRIVATE).',
            details: uploadError.message
          })
        };
      }

      throw uploadError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        filePath: filePath,
        contentType: contentType || 'video/webm'
      })
    };

  } catch (err) {
    console.error('Get video upload URL error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
