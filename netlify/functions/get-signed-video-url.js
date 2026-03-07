const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
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
    const { filePath, checkExists } = JSON.parse(event.body || '{}');

    if (!filePath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'filePath is required' })
      };
    }

    // Verify the file actually exists in storage before signing
    // This prevents generating signed URLs for deleted/missing files
    const parts = filePath.split('/');
    const folder = parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];
    let fileExists = null;

    try {
      const { data: files, error: listError } = await supabase.storage
        .from('workout-assets')
        .list(folder, { limit: 500 });
      if (listError) {
        console.error('[get-signed-video-url] list error:', listError.message);
      } else {
        fileExists = files?.some(f => f.name === fileName) || false;
        console.log(`[get-signed-video-url] File "${fileName}" in "${folder}": ${fileExists ? 'EXISTS' : 'NOT FOUND'}. Files in folder:`, files?.map(f => f.name));
      }
    } catch (listErr) {
      console.error('[get-signed-video-url] list exception:', listErr.message);
    }

    if (fileExists === false) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'File not found in storage',
          filePath,
          fileExists: false
        })
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
        fileExists,
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
