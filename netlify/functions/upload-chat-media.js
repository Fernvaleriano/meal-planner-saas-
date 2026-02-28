// Netlify Function to upload chat media (photos, videos)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'chat-media';
const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

    const { fileData, fileName, coachId, clientId } = JSON.parse(event.body);

    if (!fileData || !coachId || !clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileData, coachId, and clientId are required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Storage not available' }) };
    }

    // Parse base64 data URI
    const dataMatch = fileData.match(/^data:(image|video)\/(\w+);base64,(.+)$/);
    if (!dataMatch) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid file data format. Must be image or video.' }) };
    }

    const mediaCategory = dataMatch[1]; // image or video
    const fileType = dataMatch[2];
    const base64Data = dataMatch[3];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'File too large. Maximum 250MB.' }) };
    }

    const timestamp = Date.now();
    const storagePath = `${coachId}/${clientId}/${timestamp}.${fileType}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: `${mediaCategory}/${fileType}`,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Upload failed: ' + uploadError.message }) };
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        mediaUrl: urlData.publicUrl,
        mediaType: mediaCategory
      })
    };

  } catch (error) {
    console.error('Error in upload-chat-media:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
