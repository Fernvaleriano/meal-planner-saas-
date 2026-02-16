const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, videoName, metadata } = JSON.parse(event.body || '{}');

    if (!coachId || !videoName || !metadata) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId, videoName, and metadata are required' }) };
    }

    const metaFilePath = `video-thumbnails/${coachId}/metadata.json`;

    // Try to read existing metadata file
    let allMeta = {};
    const { data: existingData } = await supabase.storage
      .from(BUCKET_NAME)
      .download(metaFilePath);

    if (existingData) {
      try {
        const text = await existingData.text();
        allMeta = JSON.parse(text);
      } catch (e) {
        // Invalid JSON, start fresh
      }
    }

    // Update metadata for this video
    allMeta[videoName] = { ...(allMeta[videoName] || {}), ...metadata };

    // Save back
    const metaBuffer = Buffer.from(JSON.stringify(allMeta));
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(metaFilePath, metaBuffer, {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) {
      throw new Error('Failed to save metadata: ' + uploadError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('Save video metadata error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
