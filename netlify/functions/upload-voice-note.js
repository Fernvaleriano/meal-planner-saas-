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
    const { coachId, audioData, fileName } = JSON.parse(event.body || '{}');

    if (!coachId || !audioData || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId, audioData, and fileName are required' })
      };
    }

    // Extract base64 data from data URL
    const base64Data = audioData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase storage (PRIVATE bucket)
    const filePath = `voice-notes/${coachId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .upload(filePath, buffer, {
        contentType: 'audio/webm',
        upsert: true
      });

    if (error) {
      if (error.message.includes('bucket') || error.statusCode === 404) {
        console.log('Storage bucket not configured, returning null URL');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            url: null,
            message: 'Storage not configured, voice note stored locally'
          })
        };
      }
      throw error;
    }

    // Generate a signed URL (private, expires in 7 days)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: signedUrlData?.signedUrl || null,
        filePath: filePath,
        isPrivate: true
      })
    };

  } catch (err) {
    console.error('Upload voice note error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
