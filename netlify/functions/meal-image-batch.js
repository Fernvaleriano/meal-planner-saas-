// Netlify Function to batch retrieve meal images
// This is much faster than making individual requests for each meal
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
function extractProteinCarbKey(mealName) {
  const lowerName = mealName
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+\s*(g|oz|ml|cups?|tbsp|tsp|whole|slices?|pieces?|medium|large|small|scoop|scoops)\b/gi, '')
    .trim();

  let foundProtein = null;
  const sortedProteins = [...PROTEINS].sort((a, b) => b.length - a.length);
  for (const protein of sortedProteins) {
    if (lowerName.includes(protein)) {
      foundProtein = protein.replace(/\s+/g, '_');
      break;
    }
  }

  let foundCarb = null;
  const sortedCarbs = [...CARBS].sort((a, b) => b.length - a.length);
  for (const carb of sortedCarbs) {
    if (lowerName.includes(carb)) {
      foundCarb = carb.replace(/\s+/g, '_');
      break;
    }
  }

  if (foundProtein && foundCarb) {
    return `${foundProtein}_with_${foundCarb}`;
  } else if (foundProtein) {
    return foundProtein;
  } else {
    return normalizeMealName(mealName);
  }
}

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

    // Extract keys for all meal names
    const mealKeyMap = {};
    const uniqueKeys = new Set();

    mealNames.forEach(mealName => {
      const key = extractProteinCarbKey(mealName);
      mealKeyMap[mealName] = key;
      uniqueKeys.add(key);
    });

    // Also extract protein-only keys for fallback matching
    const proteinOnlyKeys = new Set();
    uniqueKeys.forEach(key => {
      if (key.includes('_with_')) {
        proteinOnlyKeys.add(key.split('_with_')[0]);
      }
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

    // If some keys weren't found, try protein-only fallback
    const missingKeys = allKeys.filter(key => !imageMap[key] && key.includes('_with_'));
    if (missingKeys.length > 0) {
      const proteinKeys = [...new Set(missingKeys.map(k => k.split('_with_')[0]))];

      // Fetch protein-only matches
      const { data: proteinImages } = await supabase
        .from('meal_images')
        .select('normalized_name, image_url')
        .or(proteinKeys.map(pk => `normalized_name.like.${pk}_with_%`).join(','));

      // Map protein images as fallbacks
      (proteinImages || []).forEach(img => {
        const protein = img.normalized_name.split('_with_')[0];
        // Add to imageMap for any missing key that starts with this protein
        missingKeys.forEach(key => {
          if (key.startsWith(protein + '_with_') && !imageMap[key]) {
            imageMap[key] = img.image_url;
          }
        });
      });
    }

    // Build response mapping meal names to optimized image URLs
    // Use 280px width (2x for 140px display) with 75% quality for fast loading
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
