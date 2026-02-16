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
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { filePath } = JSON.parse(event.body || '{}');

    if (!filePath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'filePath is required' })
      };
    }

    // Generate a signed URL for viewing
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      throw signedUrlError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: signedUrlData.signedUrl,
        filePath: filePath,
        expiresIn: SIGNED_URL_EXPIRY
      })
    };

  } catch (err) {
    console.error('Get signed video URL error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
