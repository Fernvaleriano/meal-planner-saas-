// Netlify Function to validate nutrition data using USDA FoodData Central API
const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1';

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API key is configured
  if (!USDA_API_KEY) {
    console.error('❌ USDA_API_KEY not configured in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'USDA API key not configured' })
    };
  }

  try {
    const { foodName, portion } = JSON.parse(event.body);

    if (!foodName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'foodName is required' })
      };
    }

    console.log(`📤 Searching USDA for: ${foodName}`);

    // Search for the food
    const searchResponse = await fetch(
      `${USDA_API_URL}/foods/search?query=${encodeURIComponent(foodName)}&api_key=${USDA_API_KEY}&pageSize=5`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('❌ USDA API Error:', errorText);
      return {
        statusCode: searchResponse.status,
        body: JSON.stringify({
          error: 'USDA API request failed',
          details: errorText
        })
      };
    }

    const searchData = await searchResponse.json();
    console.log(`✅ USDA returned ${searchData.foods?.length || 0} results`);

    if (!searchData.foods || searchData.foods.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Food not found in USDA database',
          foodName: foodName
        })
      };
    }

    // Get the first (most relevant) result
    const food = searchData.foods[0];

    // Extract nutritional info
    const nutrients = {};
    food.foodNutrients.forEach(nutrient => {
      const name = nutrient.nutrientName.toLowerCase();
      if (name.includes('protein')) {
        nutrients.protein = nutrient.value;
      } else if (name.includes('carbohydrate')) {
        nutrients.carbs = nutrient.value;
      } else if (name.includes('total lipid') || name.includes('fat')) {
        nutrients.fat = nutrient.value;
      } else if (name.includes('energy') && nutrient.unitName === 'KCAL') {
        nutrients.calories = nutrient.value;
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        foodName: food.description,
        fdcId: food.fdcId,
        servingSize: food.servingSize || 100,
        servingSizeUnit: food.servingSizeUnit || 'g',
        nutrients: nutrients,
        portion: portion
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
