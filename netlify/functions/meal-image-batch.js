// Netlify Function to batch retrieve meal images
// This is much faster than making individual requests for each meal
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Return the original storage URL without transformation
// Note: Supabase Image Transformations (/render/image/) require a paid plan
// and will fail with 404 if not enabled, breaking image display
function getOptimizedImageUrl(originalUrl, width = 280, quality = 75) {
  // Return original URL directly - transformations disabled to ensure images load
  return originalUrl;
}

// Normalize meal name for consistent lookups
// Strips out portion sizes, gram amounts, and numbers
function normalizeMealName(mealName) {
  return mealName
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+\s*(g|oz|ml|cups?|tbsp|tsp|whole|slices?|pieces?)\b/gi, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { mealNames } = body;

    if (!mealNames || !Array.isArray(mealNames) || mealNames.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'mealNames array is required' })
      };
    }

    // Limit to prevent abuse
    if (mealNames.length > 50) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Maximum 50 meals per request' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Extract normalized keys for all meal names
    const mealKeyMap = {};
    const uniqueKeys = new Set();

    mealNames.forEach(mealName => {
      const key = normalizeMealName(mealName);
      mealKeyMap[mealName] = key;
      uniqueKeys.add(key);
    });

    // Fetch all matching images in one query
    const allKeys = [...uniqueKeys];
    const { data: images, error } = await supabase
      .from('meal_images')
      .select('normalized_name, image_url, meal_name')
      .in('normalized_name', allKeys);

    if (error) {
      console.error('Error fetching images:', error);
      throw error;
    }

    // Create a map of key -> image URL
    const imageMap = {};
    (images || []).forEach(img => {
      imageMap[img.normalized_name] = img.image_url;
    });

    // Build response mapping meal names to image URLs
    const results = {};
    mealNames.forEach(mealName => {
      const key = mealKeyMap[mealName];
      const originalUrl = imageMap[key] || null;
      results[mealName] = originalUrl ? getOptimizedImageUrl(originalUrl, 280, 75) : null;
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      },
      body: JSON.stringify({
        images: results,
        cached: true
      })
    };

  } catch (error) {
    console.error('Error in meal-image-batch:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
