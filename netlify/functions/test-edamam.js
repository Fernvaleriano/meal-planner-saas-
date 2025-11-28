// Simple test endpoint to debug Edamam API connection
const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

exports.handler = async (event, context) => {
  const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
  const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;

  const results = {
    credentials: {
      hasAppId: !!EDAMAM_APP_ID,
      hasApiKey: !!EDAMAM_API_KEY,
      appIdLength: EDAMAM_APP_ID?.length || 0,
      apiKeyLength: EDAMAM_API_KEY?.length || 0,
      appIdPreview: EDAMAM_APP_ID ? `${EDAMAM_APP_ID.substring(0, 4)}...` : 'NOT SET'
    },
    apiTest: null,
    error: null
  };

  if (EDAMAM_APP_ID && EDAMAM_API_KEY) {
    try {
      const testUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=chicken&nutrition-type=logging`;

      const response = await fetch(testUrl);
      const responseText = await response.text();

      results.apiTest = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responsePreview: responseText.substring(0, 500)
      };

      if (response.ok) {
        const data = JSON.parse(responseText);
        results.apiTest.foodsFound = (data.hints?.length || 0) + (data.parsed?.length || 0);
        results.apiTest.success = true;
      }
    } catch (err) {
      results.error = err.message;
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(results, null, 2)
  };
};
