// Netlify Function to search USDA FoodData Central API
// Keeps API key secure on server side

const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1';

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

  const USDA_API_KEY = process.env.USDA_API_KEY;

  if (!USDA_API_KEY) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'USDA API key not configured' })
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

    // Search USDA FoodData Central
    const searchUrl = `${USDA_API_URL}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=15&dataType=Foundation,SR Legacy`;

    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform results to simpler format with nutrition per 100g
    const foods = (data.foods || []).map(food => {
      // Extract key nutrients
      const nutrients = {};
      (food.foodNutrients || []).forEach(n => {
        // Energy (calories) - nutrient ID 1008
        if (n.nutrientId === 1008 || n.nutrientName?.toLowerCase().includes('energy')) {
          if (n.unitName === 'KCAL' || n.unitName === 'kcal') {
            nutrients.calories = Math.round(n.value || 0);
          }
        }
        // Protein - nutrient ID 1003
        if (n.nutrientId === 1003 || n.nutrientName?.toLowerCase() === 'protein') {
          nutrients.protein = Math.round((n.value || 0) * 10) / 10;
        }
        // Carbohydrates - nutrient ID 1005
        if (n.nutrientId === 1005 || n.nutrientName?.toLowerCase().includes('carbohydrate')) {
          nutrients.carbs = Math.round((n.value || 0) * 10) / 10;
        }
        // Fat - nutrient ID 1004
        if (n.nutrientId === 1004 || n.nutrientName?.toLowerCase().includes('total lipid')) {
          nutrients.fat = Math.round((n.value || 0) * 10) / 10;
        }
      });

      return {
        fdcId: food.fdcId,
        name: food.description,
        brand: food.brandOwner || null,
        category: food.foodCategory || null,
        // Nutrients per 100g
        caloriesPer100g: nutrients.calories || 0,
        proteinPer100g: nutrients.protein || 0,
        carbsPer100g: nutrients.carbs || 0,
        fatPer100g: nutrients.fat || 0
      };
    }).filter(food => food.caloriesPer100g > 0); // Only return foods with calorie data

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        query: query,
        totalHits: data.totalHits || 0,
        foods: foods
      })
    };

  } catch (error) {
    console.error('❌ USDA search error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to search USDA database',
        message: error.message
      })
    };
  }
};
