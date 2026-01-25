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

    // Upload to Supabase storage
    const filePath = `exercise-videos/${coachId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .upload(filePath, buffer, {
        contentType: contentType || 'video/webm',
        upsert: true
      });

    if (error) {
      // If bucket doesn't exist, try to create it
      if (error.message.includes('bucket') || error.statusCode === 404) {
        console.log('Storage bucket may not exist:', error.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Storage not configured. Please create the workout-assets bucket in Supabase.',
            details: error.message
          })
        };
      }
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('workout-assets')
      .getPublicUrl(filePath);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: publicUrlData.publicUrl,
        size: buffer.length
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
