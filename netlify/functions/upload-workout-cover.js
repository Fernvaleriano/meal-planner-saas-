// Netlify Function to upload custom workout cover images.
// Used by client-created custom workouts to attach a hero/cover image.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Reuse the existing exercise-thumbnails bucket so we don't depend on
// new bucket provisioning. Same bucket the AI cover generator already uses.
const BUCKET_NAME = 'exercise-thumbnails';

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
        fileSizeLimit: 10485760 // 10MB
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
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const { clientId, imageData, fileName } = JSON.parse(event.body || '{}');

    if (!imageData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'imageData is required' })
      };
    }

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid image data format' })
      };
    }

    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 10MB cap to mirror bucket limit and protect the function.
    if (buffer.length > 10 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Image is too large (max 10MB)' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Storage not available' })
      };
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const ownerSegment = clientId ? String(clientId).replace(/[^a-zA-Z0-9-]/g, '') : 'anon';
    const storagePath = `workout-covers/${ownerSegment}_${timestamp}_${random}.${imageType}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: `image/${imageType}`,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to upload image: ' + uploadError.message })
      };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        imageUrl: urlData.publicUrl,
        storagePath
      })
    };
  } catch (error) {
    console.error('Error in upload-workout-cover:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
