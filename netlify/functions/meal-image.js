// Netlify Function to generate/retrieve meal images using Replicate Flux
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const BUCKET_NAME = 'meal-images';

// Convert Supabase storage URL to optimized image URL using Supabase Image Transformations
// This reduces image size significantly (from ~500KB to ~20KB for thumbnails)
function getOptimizedImageUrl(originalUrl, width = 280, quality = 75) {
  if (!originalUrl || !originalUrl.includes('supabase.co/storage')) {
    return originalUrl;
  }

  // Convert /storage/v1/object/public/ to /storage/v1/render/image/public/
  // and add transformation parameters
  const optimizedUrl = originalUrl.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );

  // Add resize and quality parameters
  const separator = optimizedUrl.includes('?') ? '&' : '?';
  return `${optimizedUrl}${separator}width=${width}&quality=${quality}&resize=contain`;
}

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

// Known proteins for extraction
const PROTEINS = [
  'chicken breast', 'chicken', 'ground turkey', 'turkey breast', 'turkey',
  'ground beef', 'beef', 'sirloin steak', 'sirloin', 'flank steak', 'steak',
  'salmon', 'cod', 'tilapia', 'tuna', 'shrimp', 'halibut', 'fish',
  'pork tenderloin', 'pork chop', 'pork',
  'eggs', 'egg',
  'greek yogurt', 'cottage cheese', 'whey protein',
  'lamb chops', 'lamb', 'bison',
  'tofu', 'tempeh'
];

// Known carbs for extraction
const CARBS = [
  'brown rice', 'white rice', 'rice', 'wild rice',
  'quinoa', 'oats', 'oatmeal',
  'sweet potato', 'russet potato', 'potato',
  'pasta', 'whole wheat pasta', 'whole wheat noodles', 'noodles',
  'whole wheat bread', 'ezekiel bread', 'bread', 'whole wheat tortilla', 'tortilla',
  'pearl barley', 'barley',
  'banana', 'apple', 'strawberries', 'blueberries', 'mixed berries'
];

// Extract protein + carb key for image matching
// This allows meals with same protein and carb to share images
function extractProteinCarbKey(mealName) {
  const lowerName = mealName
    .toLowerCase()
    // Remove portion info in parentheses
    .replace(/\([^)]*\)/g, '')
    // Remove numbers and measurements
    .replace(/\d+\s*(g|oz|ml|cups?|tbsp|tsp|whole|slices?|pieces?|medium|large|small|scoop|scoops)\b/gi, '')
    .trim();

  // Find the protein (check longer matches first)
  let foundProtein = null;
  const sortedProteins = [...PROTEINS].sort((a, b) => b.length - a.length);
  for (const protein of sortedProteins) {
    if (lowerName.includes(protein)) {
      foundProtein = protein.replace(/\s+/g, '_');
      break;
    }
  }

  // Find the carb (check longer matches first)
  let foundCarb = null;
  const sortedCarbs = [...CARBS].sort((a, b) => b.length - a.length);
  for (const carb of sortedCarbs) {
    if (lowerName.includes(carb)) {
      foundCarb = carb.replace(/\s+/g, '_');
      break;
    }
  }

  // Build the key
  if (foundProtein && foundCarb) {
    return `${foundProtein}_with_${foundCarb}`;
  } else if (foundProtein) {
    return foundProtein;
  } else {
    // Fallback to full normalization if no protein found
    return normalizeMealName(mealName);
  }
}

// Normalize meal name for consistent lookups (full version, used as fallback)
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

// Helper to wait/sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate image with Replicate Google Imagen 4 Fast
async function generateMealImage(mealName, customPrompt = null) {
  // Use custom prompt if provided, otherwise generate default prompt from meal name
  const prompt = customPrompt
    ? `Professional food photography: ${customPrompt}. Beautiful presentation. Top-down or 45-degree angle. Soft natural lighting. Appetizing and realistic. No text, words, or labels.`
    : `Professional food photography of a healthy fitness meal: ${mealName}. Show this as a complete, cohesive plated dish cooked together - NOT separate ingredients laid out. The meal should look like something served at a healthy restaurant or home-cooked in a skillet/pan. Beautiful presentation. Top-down or 45-degree angle. Soft natural lighting. Appetizing and realistic. No text, words, or labels.`;

  console.log('Using prompt:', customPrompt ? 'CUSTOM' : 'AUTO', '-', prompt.substring(0, 100) + '...');

  console.log('Calling Replicate Imagen 4 Fast API...');

  // Create prediction using Google Imagen 4 Fast (fast, excellent photorealism)
  const response = await fetch('https://api.replicate.com/v1/models/google/imagen-4-fast/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'  // Wait for result instead of polling
    },
    body: JSON.stringify({
      input: {
        prompt: prompt,
        aspect_ratio: '1:1',
        negative_prompt: 'text, words, labels, watermark, blurry, low quality, cartoon, illustration, raw ingredients, uncooked'
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

  // If using 'Prefer: wait', result should be ready
  if (prediction.status === 'succeeded' && prediction.output) {
    // Imagen 4 / Flux returns an array of image URLs or a single URL
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return imageUrl;
  }

  // If not ready, poll for result
  if (prediction.status === 'processing' || prediction.status === 'starting') {
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;

      const pollResponse = await fetch(prediction.urls.get, {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
        }
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

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

      // Use protein+carb key for matching (allows similar meals to share images)
      const imageKey = extractProteinCarbKey(mealName);
      console.log(`Looking up image for "${mealName}" with key: ${imageKey}`);

      // Check if image exists in database using the protein+carb key
      let { data: existingImage, error } = await supabase
        .from('meal_images')
        .select('*')
        .eq('normalized_name', imageKey)
        .single();

      // If no match with protein+carb key, try partial match on the key
      if (!existingImage && imageKey.includes('_with_')) {
        const proteinOnly = imageKey.split('_with_')[0];
        const { data: proteinMatch } = await supabase
          .from('meal_images')
          .select('*')
          .like('normalized_name', `${proteinOnly}_with_%`)
          .limit(1)
          .single();

        if (proteinMatch) {
          existingImage = proteinMatch;
          console.log(`Found protein match: ${proteinMatch.normalized_name}`);
        }
      }

      if (existingImage) {
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            exists: true,
            imageUrl: getOptimizedImageUrl(existingImage.image_url, 280, 75),
            mealName: existingImage.meal_name,
            matchedKey: existingImage.normalized_name
          })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ exists: false, searchedKey: imageKey })
      };
    }

    // POST - Generate new image for a meal
    if (event.httpMethod === 'POST') {
      if (!REPLICATE_API_TOKEN) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Replicate API token not configured' })
        };
      }

      const body = JSON.parse(event.body);
      const { mealName, regenerate, customPrompt } = body;

      if (!mealName) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Meal name is required' })
        };
      }

      // Use protein+carb key for matching (allows similar meals to share images)
      const imageKey = extractProteinCarbKey(mealName);
      console.log(`POST: Looking up image for "${mealName}" with key: ${imageKey}`);

      // Check if image already exists with this protein+carb combination
      let { data: existingImage } = await supabase
        .from('meal_images')
        .select('*')
        .eq('normalized_name', imageKey)
        .single();

      // If no exact match, try to find a similar protein+carb image
      if (!existingImage && imageKey.includes('_with_')) {
        const proteinOnly = imageKey.split('_with_')[0];
        const { data: proteinMatch } = await supabase
          .from('meal_images')
          .select('*')
          .like('normalized_name', `${proteinOnly}_with_%`)
          .limit(1)
          .single();

        if (proteinMatch && !regenerate) {
          // Found a similar image, return it
          console.log(`Found similar image: ${proteinMatch.normalized_name}`);
          return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              success: true,
              imageUrl: getOptimizedImageUrl(proteinMatch.image_url, 280, 75),
              mealName: proteinMatch.meal_name,
              cached: true,
              matchedKey: proteinMatch.normalized_name
            })
          };
        }
      }

      if (existingImage) {
        // If regenerate flag is set, delete the old image first
        if (regenerate) {
          console.log(`Regenerating image for: ${mealName}`);

          // Delete from storage
          if (existingImage.storage_path) {
            await supabase.storage
              .from(BUCKET_NAME)
              .remove([existingImage.storage_path]);
          }

          // Delete from database
          await supabase
            .from('meal_images')
            .delete()
            .eq('id', existingImage.id);
        } else {
          // Return cached image
          return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              success: true,
              imageUrl: getOptimizedImageUrl(existingImage.image_url, 280, 75),
              mealName: existingImage.meal_name,
              cached: true
            })
          };
        }
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

      console.log(`Generating image for: ${mealName}${customPrompt ? ' (custom prompt)' : ''}`);
      console.log(`Will be stored with key: ${imageKey}`);

      // Generate image with Replicate Imagen 4 Fast
      const imageUrl = await generateMealImage(mealName, customPrompt);

      // Download the generated image
      const imageBuffer = await downloadImage(imageUrl);

      // Upload to Supabase Storage (use imageKey for filename)
      const filename = `${imageKey}_${Date.now()}.png`;

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

      const permanentImageUrl = urlData.publicUrl;

      // Save to database for future lookups (use protein+carb key for matching)
      const { data: savedImage, error: saveError } = await supabase
        .from('meal_images')
        .insert([
          {
            meal_name: mealName,
            normalized_name: imageKey,  // Use protein+carb key for future matching
            image_url: permanentImageUrl,
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
          imageUrl: getOptimizedImageUrl(permanentImageUrl, 280, 75),
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
