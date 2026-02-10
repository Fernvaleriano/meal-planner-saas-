const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60;

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
    const { coachId } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId is required' }) };
    }

    const folderPath = `exercise-videos/${coachId}`;

    // List all files in the coach's video folder
    const { data: files, error: listError } = await supabase.storage
      .from('workout-assets')
      .list(folderPath, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

    if (listError) {
      console.error('Error listing videos:', listError);
      throw listError;
    }

    if (!files || files.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ videos: [] }) };
    }

    // Generate signed URLs for each file
    const filePaths = files
      .filter(f => !f.id?.endsWith('/')) // skip folders
      .map(f => `${folderPath}/${f.name}`);

    const { data: signedUrls, error: signedError } = await supabase.storage
      .from('workout-assets')
      .createSignedUrls(filePaths, SIGNED_URL_EXPIRY);

    if (signedError) {
      console.error('Error creating signed URLs:', signedError);
    }

    const urlMap = new Map();
    if (signedUrls) {
      signedUrls.forEach(item => {
        if (item.signedUrl) urlMap.set(item.path, item.signedUrl);
      });
    }

    const videos = files
      .filter(f => !f.id?.endsWith('/'))
      .map(f => ({
        name: f.name,
        filePath: `${folderPath}/${f.name}`,
        size: f.metadata?.size || 0,
        createdAt: f.created_at,
        contentType: f.metadata?.mimetype || 'video/webm',
        signedUrl: urlMap.get(`${folderPath}/${f.name}`) || null
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ videos })
    };

  } catch (err) {
    console.error('List coach videos error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
