// Netlify Function to generate workout cover images using Replicate
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const BUCKET_NAME = 'workout-covers';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Helper function to ensure bucket exists
async function ensureBucketExists(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      console.log(`Creating bucket: ${BUCKET_NAME}`);
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

// Helper to wait/sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate image with Replicate
async function generateCoverImage(programName, programType, description) {
  // Build a fitness-focused prompt
  const prompt = `Professional fitness photography for a workout program called "${programName}".
Scene: ${description}.
Style: Modern fitness aesthetic, motivational, professional gym or training environment.
Mood: Energetic, inspiring, powerful.
Composition: Wide aspect ratio suitable for a cover image.
Technical: High quality, sharp focus, dramatic lighting.
No text, words, logos, or watermarks.`;

  console.log('Generating cover image with prompt:', prompt.substring(0, 150) + '...');

  // Use Google Imagen 4 Fast (same as meal-image.js)
  const response = await fetch('https://api.replicate.com/v1/models/google/imagen-4-fast/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'
    },
    body: JSON.stringify({
      input: {
        prompt: prompt,
        aspect_ratio: '16:9', // Wide format for cover images
        negative_prompt: 'text, words, labels, watermark, blurry, low quality, cartoon, illustration, deformed, ugly'
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Replicate API error:', error);
    throw new Error(`Replicate API error: ${error}`);
  }

  const prediction = await response.json();
  console.log('Replicate prediction status:', prediction.status);

  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return imageUrl;
  }

  // Poll if not ready
  if (prediction.status === 'processing' || prediction.status === 'starting') {
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;

      const pollResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
      });

      if (!pollResponse.ok) {
        throw new Error('Failed to poll prediction status');
      }

      result = await pollResponse.json();
      console.log(`Poll attempt ${attempts}: ${result.status}`);
    }

    if (result.status === 'succeeded' && result.output) {
      const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      return imageUrl;
    }

    if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error || 'Unknown error'}`);
    }

    throw new Error('Image generation timed out');
  }

  throw new Error(`Unexpected prediction status: ${prediction.status}`);
}

// Download image from URL and return as buffer
async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('Failed to download generated image');
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

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

  if (!REPLICATE_API_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Replicate API token not configured' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Supabase not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { programName, programType, description } = body;

    if (!programName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Program name is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists(supabase);
    if (!bucketReady) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to initialize storage bucket' })
      };
    }

    console.log(`Generating cover image for: ${programName}`);

    // Generate the image
    const generatedImageUrl = await generateCoverImage(programName, programType, description);

    // Download the generated image
    const imageBuffer = await downloadImage(generatedImageUrl);

    // Upload to Supabase Storage
    const filename = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, imageBuffer, {
        contentType: 'image/png',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to upload image: ' + uploadError.message })
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename);

    const permanentImageUrl = urlData.publicUrl;

    console.log('Cover image generated and uploaded:', permanentImageUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: permanentImageUrl
      })
    };

  } catch (error) {
    console.error('Error generating cover image:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate cover image: ' + error.message })
    };
  }
};
