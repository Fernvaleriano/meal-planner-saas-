const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
    const { coachId, videoData, fileName } = JSON.parse(event.body || '{}');

    if (!coachId || !videoData || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId, videoData, and fileName are required' })
      };
    }

    // Extract base64 data from data URL
    const matches = videoData.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid video data format' })
      };
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Video too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` })
      };
    }

    // Upload to Supabase storage (PRIVATE bucket)
    const filePath = `exercise-videos/${coachId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .upload(filePath, buffer, {
        contentType: contentType || 'video/webm',
        upsert: true
      });

    if (error) {
      if (error.message.includes('bucket') || error.statusCode === 404) {
        console.log('Storage bucket may not exist:', error.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Storage not configured. Please create the workout-assets bucket in Supabase (keep it PRIVATE).',
            details: error.message
          })
        };
      }
      throw error;
    }

    // Generate a signed URL (private, expires in 7 days)
    // We store the file path, and generate fresh signed URLs when needed
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      // Fall back to storing the path - we'll generate signed URLs on retrieval
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          // Store the path, not a public URL - client will need to request signed URL
          url: signedUrlData?.signedUrl || null,
          filePath: filePath,
          size: buffer.length,
          isPrivate: true
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: signedUrlData.signedUrl,
        filePath: filePath,
        size: buffer.length,
        expiresIn: SIGNED_URL_EXPIRY,
        isPrivate: true
      })
    };

  } catch (err) {
    console.error('Upload exercise video error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
