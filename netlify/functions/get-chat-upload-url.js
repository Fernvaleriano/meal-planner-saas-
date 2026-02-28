// Netlify Function to get a signed upload URL for chat media
// This allows clients to upload files directly to Supabase Storage,
// bypassing the Netlify Function body size limit (~6MB).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'chat-media';
const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

async function ensureBucketExists(supabase) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: ['image/*', 'video/*']
      });
    }
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const { coachId, clientId, contentType, fileExtension } = JSON.parse(event.body || '{}');

    if (!coachId || !clientId || !contentType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'coachId, clientId, and contentType are required' })
      };
    }

    // Validate content type
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Only image and video files are allowed' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Storage not available' }) };
    }

    const mediaCategory = contentType.startsWith('video/') ? 'video' : 'image';
    const ext = fileExtension || contentType.split('/')[1] || 'bin';
    const timestamp = Date.now();
    const storagePath = `${coachId}/${clientId}/${timestamp}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to create upload URL: ' + uploadError.message })
      };
    }

    // Also get the public URL so the client knows the final URL
    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        publicUrl: urlData.publicUrl,
        mediaType: mediaCategory,
        storagePath
      })
    };

  } catch (error) {
    console.error('Error in get-chat-upload-url:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
