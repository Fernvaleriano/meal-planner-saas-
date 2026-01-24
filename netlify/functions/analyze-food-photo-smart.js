// Smart food photo analysis using Gemini 2.5 Flash (cost-effective vision model)
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_25_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_20_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Safety settings - use OFF for 2.5 Flash (BLOCK_NONE doesn't work properly)
const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" }
];

// Helper to check if response was blocked
function isSafetyBlocked(data) {
    const finishReason = data.candidates?.[0]?.finishReason;
    const blocked = finishReason === 'SAFETY' || finishReason === 'BLOCKED' || finishReason === 'OTHER';
    const noContent = !data.candidates?.[0]?.content?.parts?.length;
    const promptBlocked = data.promptFeedback?.blockReason;
    return blocked || (noContent && !data.error) || promptBlocked;
}

// Helper to call Gemini API
async function callGemini(url, parts, useSafety = true) {
    const body = {
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    };
    if (useSafety) body.safetySettings = safetySettings;
    return fetch(`${url}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// Helper function to strip markdown formatting from text
function stripMarkdown(text) {
    if (!text) return text;
    return String(text)
        .replace(/\*\*\*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/___/g, '')
        .replace(/__/g, '')
        .replace(/_/g, ' ')
        .replace(/~~~/g, '')
        .replace(/~~/g, '')
        .replace(/`/g, '')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
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

        // Verify authenticated user
        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        // Rate limit - 10 smart analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-photo-smart', 10, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-food-photo-smart`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`🧠 Smart analysis for user ${user.id} (${rateLimit.remaining} requests remaining)`);

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Smart AI analysis is not configured. Please add GEMINI_API_KEY to environment variables.' })
            };
        }

        // Parse body
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

        // Extract base64 data and media type
        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (!matches) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid image format' })
            };
        }

        const mimeType = matches[1];
        const base64Data = matches[2];

        // User-provided context about the food (optional)
        const userContext = details ? details.trim() : null;

        console.log('🧠 Calling Gemini 2.5 Flash for smart food analysis...');

        // Build the prompt
        const analysisPrompt = `Analyze this food image carefully and identify all food items visible. For each item, provide accurate nutritional estimates.

${userContext ? `IMPORTANT - User provided these details about the food: "${userContext}"
Use this information to accurately identify and estimate the nutritional content.` : ''}

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

Guidelines for ACCURATE estimation:
- Carefully estimate portion sizes by comparing to standard references (plate size, utensils visible, hand size)
- Be specific about portions (e.g., "Grilled Chicken Breast, ~6oz" not just "Chicken")
- Account for cooking methods (grilled vs fried affects calories significantly)
- Consider visible fats, oils, sauces, and dressings
- If skin is visible on meat, account for it
- Round calories to nearest 5, macros to nearest gram
- If multiple items are visible, list each separately
- Use USDA standard values as your reference
- If the user provided details, prioritize using that information
- Return empty array [] if no food is visible

Take your time to be accurate. Return ONLY the JSON array.`;

        // Build parts array for Gemini
        const parts = [
            { text: analysisPrompt },
            {
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            }
        ];

        let data;
        let content;
        let usedFallback = false;

        try {
            // Try Gemini 2.5 Flash first
            let response = await callGemini(GEMINI_25_URL, parts, true);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini 2.5 API error:', errorText);
                throw new Error(`Gemini 2.5 API error: ${response.status}`);
            }

            data = await response.json();
            content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Check if blocked - fallback to 2.0 Flash
            if (!content || isSafetyBlocked(data)) {
                const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'unknown';
                console.log(`🧠 Gemini 2.5 blocked (${reason}), falling back to 2.0 Flash...`);

                response = await callGemini(GEMINI_20_URL, parts, false);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Gemini 2.0 fallback error:', errorText);
                    throw new Error(`Gemini 2.0 API error: ${response.status}`);
                }

                data = await response.json();
                content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                usedFallback = true;
            }
        } catch (apiError) {
            console.error('Gemini API error:', apiError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis request failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        console.log(`✅ Gemini response received${usedFallback ? ' (2.0 fallback)' : ''}`);

        if (!content) {
            console.error('No content from Gemini:', JSON.stringify(data).substring(0, 500));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ foods: [], model: usedFallback ? 'gemini-2.0-flash' : 'gemini-2.5-flash', smart: true })
            };
        }

        console.log('Gemini response:', content.substring(0, 200));

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from markdown code blocks
            let cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    foods = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('Could not parse extracted JSON:', e);
                }
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
            body: JSON.stringify({
                foods,
                model: usedFallback ? 'gemini-2.0-flash' : 'gemini-2.5-flash',
                smart: true
            })
        };

    } catch (error) {
        console.error('Error in smart food analysis:', error);
        console.error('Error stack:', error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Smart analysis failed',
                details: error.message || 'Unknown error'
            })
        };
    }
};
