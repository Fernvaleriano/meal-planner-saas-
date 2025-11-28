// Netlify Function to search Edamam Food Database API
// Replaces USDA FoodData Central - keeps API key secure on server side

const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

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

  const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
  const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;

  if (!EDAMAM_APP_ID || !EDAMAM_API_KEY) {
    console.error('Missing Edamam credentials:', {
      hasAppId: !!EDAMAM_APP_ID,
      hasApiKey: !!EDAMAM_API_KEY
    });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Edamam API credentials not configured' })
    };
  }

  try {
    const query = event.queryStringParameters?.query;

    if (!query || query.trim().length < 2) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Search query must be at least 2 characters' })
      };
    }

    // Search Edamam Food Database
    const searchUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=${encodeURIComponent(query)}&nutrition-type=logging`;

    console.log(`🔍 Searching Edamam for: "${query}"`);

    const response = await fetch(searchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edamam API error:', response.status, errorText);
      throw new Error(`Edamam API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform Edamam results to match our expected format
    // Edamam returns { parsed: [...], hints: [...] }
    const allFoods = [];

    // Add parsed foods (exact matches)
    if (data.parsed && data.parsed.length > 0) {
      data.parsed.forEach(item => {
        if (item.food) {
          allFoods.push(item.food);
        }
      });
    }

    // Add hint foods (similar matches)
    if (data.hints && data.hints.length > 0) {
      data.hints.forEach(hint => {
        if (hint.food) {
          allFoods.push(hint.food);
        }
      });
    }

    // Transform to our format - limit to 20 results
    const foods = allFoods.slice(0, 20).map(food => {
      const nutrients = food.nutrients || {};

      return {
        fdcId: food.foodId,
        name: food.label,
        brand: food.brand || null,
        category: food.category || food.categoryLabel || null,
        // Nutrients per 100g (Edamam provides per 100g by default)
        caloriesPer100g: Math.round(nutrients.ENERC_KCAL || 0),
        proteinPer100g: Math.round((nutrients.PROCNT || 0) * 10) / 10,
        carbsPer100g: Math.round((nutrients.CHOCDF || 0) * 10) / 10,
        fatPer100g: Math.round((nutrients.FAT || 0) * 10) / 10,
        // Additional Edamam data
        image: food.image || null,
        servingSizes: food.servingSizes || null
      };
    }).filter(food => food.caloriesPer100g > 0); // Only return foods with calorie data

    console.log(`✅ Found ${foods.length} foods for "${query}"`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        query: query,
        totalHits: allFoods.length,
        foods: foods,
        source: 'edamam'
      })
    };

  } catch (error) {
    console.error('❌ Edamam search error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to search food database',
        message: error.message
      })
    };
  }
};
