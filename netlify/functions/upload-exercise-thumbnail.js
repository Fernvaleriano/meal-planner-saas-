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
    const body = JSON.parse(event.body || '{}');
    const { exerciseId, thumbnailUrl, imageBase64, imageName } = body;

    if (!exerciseId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'exerciseId is required' })
      };
    }

    let finalThumbnailUrl = thumbnailUrl;

    // If base64 image provided, upload to storage
    if (imageBase64 && imageName) {
      // Extract base64 data (remove data:image/xxx;base64, prefix if present)
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Determine content type from imageName
      const extension = imageName.split('.').pop().toLowerCase();
      const contentTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      const contentType = contentTypes[extension] || 'image/jpeg';

      // Create unique filename
      const timestamp = Date.now();
      const sanitizedName = imageName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `manual-uploads/${exerciseId}_${timestamp}_${sanitizedName}`;

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        throw new Error('Failed to upload image: ' + uploadError.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      finalThumbnailUrl = urlData.publicUrl;
    }

    if (!finalThumbnailUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Either thumbnailUrl or imageBase64 with imageName is required' })
      };
    }

    // Update exercise with new thumbnail URL
    const { data: exercise, error: updateError } = await supabase
      .from('exercises')
      .update({ thumbnail_url: finalThumbnailUrl })
      .eq('id', exerciseId)
      .select()
      .single();

    if (updateError) {
      throw new Error('Failed to update exercise: ' + updateError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        exercise: {
          id: exercise.id,
          name: exercise.name,
          thumbnail_url: exercise.thumbnail_url
        }
      })
    };

  } catch (err) {
    console.error('Upload thumbnail error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
