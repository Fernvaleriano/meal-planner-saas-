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
      // Extract key nutrients - handle different USDA data formats
      let calories = 0, protein = 0, carbs = 0, fat = 0;

      (food.foodNutrients || []).forEach(n => {
        // Get the nutrient value - can be in 'value' or 'amount' field
        const value = n.value ?? n.amount ?? 0;

        // Energy (calories) - nutrient ID 1008 or 208
        if (n.nutrientId === 1008 || n.nutrientId === 208 ||
            n.nutrientNumber === '208' ||
            (n.nutrientName && n.nutrientName.toLowerCase().includes('energy') &&
             (n.unitName === 'KCAL' || n.unitName === 'kcal'))) {
          calories = Math.round(value);
        }

        // Protein - nutrient ID 1003 or 203
        if (n.nutrientId === 1003 || n.nutrientId === 203 ||
            n.nutrientNumber === '203' ||
            (n.nutrientName && n.nutrientName.toLowerCase() === 'protein')) {
          protein = Math.round(value * 10) / 10;
        }

        // Carbohydrates - nutrient ID 1005 or 205
        if (n.nutrientId === 1005 || n.nutrientId === 205 ||
            n.nutrientNumber === '205' ||
            (n.nutrientName && n.nutrientName.toLowerCase().includes('carbohydrate'))) {
          carbs = Math.round(value * 10) / 10;
        }

        // Fat - nutrient ID 1004 or 204
        if (n.nutrientId === 1004 || n.nutrientId === 204 ||
            n.nutrientNumber === '204' ||
            (n.nutrientName && (n.nutrientName.toLowerCase().includes('total lipid') ||
                                n.nutrientName.toLowerCase() === 'total fat'))) {
          fat = Math.round(value * 10) / 10;
        }
      });

      return {
        fdcId: food.fdcId,
        name: food.description,
        brand: food.brandOwner || null,
        category: food.foodCategory || null,
        // Nutrients per 100g
        caloriesPer100g: calories,
        proteinPer100g: protein,
        carbsPer100g: carbs,
        fatPer100g: fat
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
