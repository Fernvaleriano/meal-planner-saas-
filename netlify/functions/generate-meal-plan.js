// Netlify Function for secure Gemini API calls
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API key is configured
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not configured in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { prompt, targets, previousAttempt } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    console.log('📤 Calling Gemini API...');
    if (targets) {
      console.log('Targets:', targets);
    }
    
    // ✅ FIXED: Proper fetch syntax with parentheses
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'Gemini API request failed',
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log('✅ Gemini API Response received');
    console.log('Full response structure:', JSON.stringify(data, null, 2));

    // Validate response structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid response structure:', JSON.stringify(data));
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Invalid response from Gemini API',
          data: data
        })
      };
    }

    // Validate parts array exists
    if (!data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error('❌ Missing parts in response:', JSON.stringify(data));
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Invalid response structure from Gemini API',
          message: 'Missing parts array in response',
          data: data
        })
      };
    }

    // Log first 500 chars of AI response for debugging
    const responseText = data.candidates[0].content.parts[0].text;
    console.log('🤖 Gemini Response preview:', responseText.substring(0, 500));

    // Parse JSON (handle markdown-wrapped responses)
    const jsonData = extractJSON(responseText);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        data: jsonData,
        rawResponse: responseText
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        details: error.stack,
        apiKey: GEMINI_API_KEY ? 'configured' : 'missing'
      })
    };
  }
};

function extractJSON(text) {
  // Remove markdown code blocks if present
  let cleaned = text.trim();

  // Remove ```json and ``` if wrapped
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Try to parse
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // Try to extract JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Could not extract valid JSON from response');
  }
}
