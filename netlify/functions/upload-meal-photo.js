// Netlify Function to upload custom meal photos
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'meal-images';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Normalize meal name for storage
function normalizeMealName(mealName) {
  return mealName
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+\s*(g|oz|ml|cups?|tbsp|tsp|whole|slices?|pieces?)\b/gi, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50); // Limit length
}

// Ensure bucket exists
async function ensureBucketExists(supabase) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!bucketExists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880 // 5MB
      });
    }
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
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

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    const { mealName, imageData, fileName } = JSON.parse(event.body);

    if (!mealName || !imageData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Meal name and image data are required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Storage not available' })
      };
    }

    // Extract base64 data
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

    // Generate unique filename
    const normalizedName = normalizeMealName(mealName);
    const timestamp = Date.now();
    const storagePath = `custom_${normalizedName}_${timestamp}.${imageType}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const imageUrl = urlData.publicUrl;

    // Save to meal_images table for future reference
    const { error: saveError } = await supabase
      .from('meal_images')
      .upsert([
        {
          meal_name: mealName,
          normalized_name: `custom_${normalizedName}`,
          image_url: imageUrl,
          storage_path: storagePath,
          is_custom: true
        }
      ], {
        onConflict: 'normalized_name'
      });

    if (saveError) {
      console.warn('Could not save to meal_images table:', saveError);
      // Continue anyway - image was uploaded successfully
    }

    console.log('✅ Uploaded custom meal photo:', storagePath);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        storagePath: storagePath
      })
    };

  } catch (error) {
    console.error('Error in upload-meal-photo:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
