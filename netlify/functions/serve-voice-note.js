const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Short-lived signed URL (1 hour) - generated fresh on every request
const SIGNED_URL_EXPIRY = 60 * 60;

// Allowed path prefixes for security
const ALLOWED_PREFIXES = ['voice-notes/', 'meal-voice-notes/', 'client-voice-notes/'];

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const filePath = event.queryStringParameters?.path;
  if (!filePath) {
    return { statusCode: 400, body: 'Missing path parameter' };
  }

  // Security: only allow voice note paths
  if (!ALLOWED_PREFIXES.some(prefix => filePath.startsWith(prefix))) {
    return { statusCode: 403, body: 'Access denied' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: 'Server configuration error' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error('serve-voice-note: signed URL error:', error?.message);
      return { statusCode: 404, body: 'Voice note not found' };
    }

    // 302 redirect to the fresh signed URL
    return {
      statusCode: 302,
      headers: {
        'Location': data.signedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
      body: ''
    };
  } catch (err) {
    console.error('serve-voice-note error:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
