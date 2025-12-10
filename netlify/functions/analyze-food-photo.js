const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Gemini 1.5 Flash - stable production model with vision support
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

// Helper function to strip markdown formatting from text
function stripMarkdown(text) {
    if (!text) return text;
    return String(text)
        .replace(/\*\*\*/g, '')      // Bold italic ***text***
        .replace(/\*\*/g, '')         // Bold **text**
        .replace(/\*/g, '')           // Italic *text*
        .replace(/___/g, '')          // Bold italic ___text___
        .replace(/__/g, '')           // Bold __text__
        .replace(/_/g, ' ')           // Italic _text_ (replace with space)
        .replace(/~~~/g, '')          // Strikethrough
        .replace(/~~/g, '')           // Strikethrough ~~text~~
        .replace(/`/g, '')            // Code `text`
        .replace(/#{1,6}\s*/g, '')    // Headers # ## ###
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links [text](url)
        .replace(/\s+/g, ' ')         // Multiple spaces to single
        .trim();
}

// CORS headers - defined outside handler to ensure they're always available
const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Wrap everything in try-catch to ensure we always return JSON
    try {
        // Handle CORS preflight
        const corsResponse = handleCors(event);
        if (corsResponse) return corsResponse;

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        // ✅ SECURITY: Verify authenticated user
        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        // ✅ SECURITY: Rate limit - 20 photo analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-photo', 20, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-food-photo`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`🔐 Authenticated user ${user.id} analyzing food photo (${rateLimit.remaining} requests remaining)`);

        // Check if fetch is available (Node 18+ required)
        if (typeof fetch === 'undefined') {
            console.error('fetch is not available - Node 18+ required');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server configuration error: Node 18+ required for this function' })
            };
        }

        // Check for API key
        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI Photo analysis is not configured. Please add GEMINI_API_KEY to Netlify environment variables.' })
            };
        }

        // Parse body safely
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseErr) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }

        const { image, details } = body;

        if (!image) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No image provided' })
            };
        }

        // User-provided context about the food (optional)
        const userContext = details ? details.trim() : null;

        // Extract base64 data and media type
        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (!matches) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid image format' })
            };
        }

        const mediaType = matches[1];
        const base64Data = matches[2];

        // Call Gemini API with image
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: mediaType,
                                data: base64Data
                            }
                        },
                        {
                            text: `Analyze this food image and identify all food items visible. For each item, estimate the nutritional information.
${userContext ? `
IMPORTANT - User provided these details about the food: "${userContext}"
Use this information to accurately identify and estimate the nutritional content. For example, if the user says "black tea unsweetened", use those details for your estimate instead of guessing.
` : ''}
Return ONLY a valid JSON array with this exact format (no markdown, no explanation, no code blocks):
[
  {
    "name": "Food item name with estimated portion size",
    "calories": 000,
    "protein": 00,
    "carbs": 00,
    "fat": 00
  }
]

Guidelines:
- Be specific about portions (e.g., "Grilled Chicken Breast, 6oz" not just "Chicken")
- Round calories to nearest 5, macros to nearest gram
- If multiple items are visible, list each separately
- If the user provided details, prioritize using that information for identification
- If you cannot identify the food clearly and no user details provided, make your best estimate based on what's visible
- Only include foods actually visible in the image
- Return empty array [] if no food is visible

Return ONLY the JSON array, nothing else.`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);

            // Parse error for details
            let errorMsg = `Gemini API returned ${response.status}`;
            try {
                const errJson = JSON.parse(errorText);
                if (errJson.error?.message) errorMsg = errJson.error.message;
            } catch(e) {
                if (errorText) errorMsg = errorText.substring(0, 300);
            }

            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis failed',
                    details: errorMsg
                })
            };
        }

        const data = await response.json();

        // Extract text from Gemini response
        let content = '';
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            content = data.candidates[0].content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('');
        }

        console.log('Gemini response content:', content);

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            // Try to parse directly
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from the response (remove markdown code blocks if present)
            let cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                foods = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Could not parse Gemini response:', trimmedContent);
            }
        }

        // Validate and clean the data
        foods = foods.filter(f => f && f.name && typeof f.calories === 'number');
        foods = foods.map(f => ({
            name: stripMarkdown(f.name).substring(0, 100),
            calories: Math.max(0, Math.round(f.calories)),
            protein: Math.max(0, Math.round(f.protein || 0)),
            carbs: Math.max(0, Math.round(f.carbs || 0)),
            fat: Math.max(0, Math.round(f.fat || 0))
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ foods })
        };

    } catch (error) {
        console.error('Error analyzing food photo:', error);
        console.error('Error name:', error.name);
        console.error('Error stack:', error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to analyze image',
                details: error.message,
                name: error.name
            })
        };
    }
};
