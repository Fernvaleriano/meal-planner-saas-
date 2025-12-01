// Netlify Function to generate/retrieve meal images using Google Imagen 3
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const BUCKET_NAME = 'meal-images';

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
      const { data, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880 // 5MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
      console.log('Bucket created successfully');
    }

    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

// Normalize meal name for consistent lookups
// Strips out portion sizes, gram amounts, and numbers to match similar meals
function normalizeMealName(mealName) {
  return mealName
    .toLowerCase()
    .trim()
    // Remove portion info in parentheses like (169 g), (4 whole), (2 cups), (190g cooked)
    .replace(/\([^)]*\)/g, '')
    // Remove standalone numbers and measurements
    .replace(/\d+\s*(g|oz|ml|cups?|tbsp|tsp|whole|slices?|pieces?)\b/gi, '')
    // Remove special characters
    .replace(/[^a-z\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Replace spaces with underscores
    .replace(/\s+/g, '_');
}

// Generate image with Google Imagen 3
async function generateMealImage(mealName) {
  const prompt = `Professional food photography of a healthy fitness meal: ${mealName}. Show this as a complete, cohesive plated dish cooked together - NOT separate ingredients laid out. The meal should look like something served at a healthy restaurant or home-cooked in a skillet/pan. Beautiful presentation. Top-down or 45-degree angle. Soft natural lighting. Appetizing and realistic. No text, words, or labels.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          safetyFilterLevel: 'block_few',
          personGeneration: 'dont_allow'
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error('Imagen API error:', error);
    throw new Error(`Imagen API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();

  // Imagen returns base64 encoded image
  if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
    return {
      type: 'base64',
      data: data.predictions[0].bytesBase64Encoded
    };
  }

  throw new Error('No image generated from Imagen API');
}

// Download image from URL and return as buffer
async function downloadImage(imageData) {
  // If it's base64 data from Imagen, convert directly
  if (imageData.type === 'base64') {
    return Buffer.from(imageData.data, 'base64');
  }

  // If it's a URL (fallback for other APIs)
  const response = await fetch(imageData);
  if (!response.ok) {
    throw new Error('Failed to download generated image');
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Retrieve existing image for a meal
    if (event.httpMethod === 'GET') {
      const mealName = event.queryStringParameters?.mealName;

      if (!mealName) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Meal name is required' })
        };
      }

      const normalizedName = normalizeMealName(mealName);

      // Check if image exists in database
      const { data: existingImage, error } = await supabase
        .from('meal_images')
        .select('*')
        .eq('normalized_name', normalizedName)
        .single();

      if (existingImage) {
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            exists: true,
            imageUrl: existingImage.image_url,
            mealName: existingImage.meal_name
          })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ exists: false })
      };
    }

    // POST - Generate new image for a meal
    if (event.httpMethod === 'POST') {
      if (!GEMINI_API_KEY) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Gemini API key not configured' })
        };
      }

      const body = JSON.parse(event.body);
      const { mealName } = body;

      if (!mealName) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Meal name is required' })
        };
      }

      const normalizedName = normalizeMealName(mealName);

      // Check if image already exists
      const { data: existingImage } = await supabase
        .from('meal_images')
        .select('*')
        .eq('normalized_name', normalizedName)
        .single();

      if (existingImage) {
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            success: true,
            imageUrl: existingImage.image_url,
            mealName: existingImage.meal_name,
            cached: true
          })
        };
      }

      // Ensure bucket exists
      const bucketReady = await ensureBucketExists(supabase);
      if (!bucketReady) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Failed to initialize storage bucket' })
        };
      }

      console.log(`Generating image for: ${mealName}`);

      // Generate image with Imagen 3
      const imagenResult = await generateMealImage(mealName);

      // Download the generated image
      const imageBuffer = await downloadImage(imagenResult);

      // Upload to Supabase Storage
      const filename = `${normalizedName}_${Date.now()}.png`;

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
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Failed to upload image: ' + uploadError.message })
        };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filename);

      const imageUrl = urlData.publicUrl;

      // Save to database for future lookups
      const { data: savedImage, error: saveError } = await supabase
        .from('meal_images')
        .insert([
          {
            meal_name: mealName,
            normalized_name: normalizedName,
            image_url: imageUrl,
            storage_path: filename
          }
        ])
        .select()
        .single();

      if (saveError) {
        console.error('Save error:', saveError);
        // Image was uploaded but metadata failed - still return the URL
      }

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          success: true,
          imageUrl: imageUrl,
          mealName: mealName,
          cached: false
        })
      };
    }

    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Error in meal-image function:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
