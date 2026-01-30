const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 days

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
    const { clientId, exerciseLogId, audioData, fileName } = JSON.parse(event.body || '{}');

    if (!clientId || !audioData || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId, audioData, and fileName are required' })
      };
    }

    // Extract base64 data from data URL
    const base64Data = audioData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase storage (PRIVATE bucket)
    const filePath = `client-voice-notes/${clientId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .upload(filePath, buffer, {
        contentType: 'audio/webm',
        upsert: true
      });

    if (error) {
      if (error.message.includes('bucket') || error.statusCode === 404) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            url: null,
            filePath: null,
            message: 'Storage not configured'
          })
        };
      }
      throw error;
    }

    // If we have an exercise log ID, update it with the voice note path
    if (exerciseLogId) {
      await supabase
        .from('exercise_logs')
        .update({ client_voice_note_path: filePath })
        .eq('id', exerciseLogId);
    }

    // Generate a signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: signedUrlData?.signedUrl || null,
        filePath: filePath
      })
    };

  } catch (err) {
    console.error('Upload client voice note error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
