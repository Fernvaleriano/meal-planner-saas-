// Netlify Function to validate nutrition data using Edamam Food Database API
const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;
const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API credentials are configured
  if (!EDAMAM_APP_ID || !EDAMAM_API_KEY) {
    console.error('❌ Edamam credentials not configured in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Edamam API credentials not configured' })
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

    console.log(`📤 Searching Edamam for: ${foodName}`);

    // Search for the food using Edamam
    const searchUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=${encodeURIComponent(foodName)}&nutrition-type=logging`;

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('❌ Edamam API Error:', errorText);
      return {
        statusCode: searchResponse.status,
        body: JSON.stringify({
          error: 'Edamam API request failed',
          details: errorText
        })
      };
    }

    const searchData = await searchResponse.json();

    // Edamam returns { parsed: [...], hints: [...] }
    const allFoods = [];
    if (searchData.parsed) {
      searchData.parsed.forEach(item => {
        if (item.food) allFoods.push(item.food);
      });
    }
    if (searchData.hints) {
      searchData.hints.forEach(hint => {
        if (hint.food) allFoods.push(hint.food);
      });
    }

    console.log(`✅ Edamam returned ${allFoods.length} results`);

    if (allFoods.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Food not found in database',
          foodName: foodName
        })
      };
    }

    // Get the first (most relevant) result
    const food = allFoods[0];
    const foodNutrients = food.nutrients || {};

    // Extract nutritional info (Edamam provides per 100g)
    const nutrients = {
      calories: Math.round(foodNutrients.ENERC_KCAL || 0),
      protein: Math.round((foodNutrients.PROCNT || 0) * 10) / 10,
      carbs: Math.round((foodNutrients.CHOCDF || 0) * 10) / 10,
      fat: Math.round((foodNutrients.FAT || 0) * 10) / 10
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        foodName: food.label,
        fdcId: food.foodId,
        servingSize: 100,
        servingSizeUnit: 'g',
        nutrients: nutrients,
        portion: portion,
        brand: food.brand || null,
        category: food.category || food.categoryLabel || null,
        source: 'edamam'
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
