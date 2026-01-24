// Food photo analysis using Gemini 2.5 Flash (cost-effective vision model)
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

// Helper to check if response was blocked by safety filters
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
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
        }
    };
    if (useSafety) {
        body.safetySettings = safetySettings;
    }
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

        // Rate limit - 20 photo analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-photo', 20, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id}`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`📸 Photo analysis for user ${user.id}`);

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured. Please add GEMINI_API_KEY.' })
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

        // Support both single image and multiple images
        const { image, images, details } = body;
        const imageArray = images || (image ? [image] : []);

        if (imageArray.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No image provided' })
            };
        }

        // Process all images and extract base64 data
        const processedImages = [];
        for (const img of imageArray) {
            const matches = img.match(/^data:(.+);base64,(.+)$/);
            if (!matches) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Invalid image format' })
                };
            }
            processedImages.push({
                mimeType: matches[1],
                base64Data: matches[2]
            });
        }

        console.log(`📷 Processing ${processedImages.length} image(s) for food analysis`);

        // User-provided context
        const userContext = details ? details.trim() : null;

        // Build prompt with multi-image context
        const multiImageNote = processedImages.length > 1
            ? `You are viewing ${processedImages.length} images of food from different angles. Use ALL images together to get the most accurate identification and portion estimation.`
            : 'Analyze this food image and identify all food items visible.';

        const analysisPrompt = `${multiImageNote} For each item, estimate the nutritional information.
${userContext ? `\nIMPORTANT - User provided these details: "${userContext}"\nUse this information for your estimate.` : ''}

Return ONLY a valid JSON array with this exact format (no markdown, no explanation):
[
  {
    "name": "Food item name with portion size",
    "calories": 000,
    "protein": 00,
    "carbs": 00,
    "fat": 00
  }
]

Guidelines:
- Be specific about portions (e.g., "Grilled Chicken Breast, 6oz")
- Round calories to nearest 5, macros to nearest gram
- List each item separately
- Return empty array [] if no food is visible
${processedImages.length > 1 ? '- Use multiple angles to better estimate portion sizes' : ''}

Return ONLY the JSON array.`;

        console.log('🤖 Calling Gemini 2.5 Flash for food analysis...');

        // Build parts array with images and text for Gemini
        const parts = [
            { text: analysisPrompt },
            ...processedImages.map((img) => ({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.base64Data
                }
            }))
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

            // Check if blocked by safety filters - fallback to 2.0 Flash
            if (!content || isSafetyBlocked(data)) {
                const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'unknown';
                console.log(`📸 Gemini 2.5 blocked (${reason}), falling back to 2.0 Flash...`);

                response = await callGemini(GEMINI_20_URL, parts, false);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Gemini 2.0 fallback error:', errorText);
                    throw new Error(`Gemini 2.0 API error: ${response.status}`);
                }

                data = await response.json();
                content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                usedFallback = true;

                if (!content) {
                    console.error('Fallback also failed:', JSON.stringify(data).substring(0, 500));
                }
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

        console.log(`✅ Gemini response received${usedFallback ? ' (used 2.0 fallback)' : ''}`);

        // Check if we got valid content
        if (!content) {
            console.error('No content from Gemini:', JSON.stringify(data).substring(0, 500));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ foods: [] })
            };
        }

        console.log('Response preview:', content.substring(0, 200));

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
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
                console.error('Could not parse response:', trimmedContent);
            }
        }

        // Validate and clean data
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
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to analyze image',
                details: error.message
            })
        };
    }
};
