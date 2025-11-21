// Netlify Function for secure Gemini API calls
// Using native fetch (Node.js 18+)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, isJson = true } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    // Prepare Gemini API request
    const geminiRequest = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192
      }
    };

    // Call Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequest)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Error:', errorData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'Gemini API request failed',
          details: errorData 
        })
      };
    }

    const data = await response.json();
    
    // Extract the generated content
    let result;
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      
      if (isJson) {
        try {
          // Parse JSON response
          result = JSON.parse(text);
        } catch (e) {
          console.error('JSON parse error:', e);
          return {
            statusCode: 500,
            body: JSON.stringify({ 
              error: 'Failed to parse JSON response from Gemini',
              rawText: text
            })
          };
        }
      } else {
        result = text;
      }
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Unexpected response format from Gemini',
          data: data
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
