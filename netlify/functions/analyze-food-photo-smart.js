// Smart food photo analysis using Claude 3.5 Sonnet (more accurate, slower)
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

        // Rate limit - 10 smart analyses per minute per user (more restrictive due to cost)
        const rateLimit = checkRateLimit(user.id, 'analyze-food-photo-smart', 10, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-food-photo-smart`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`🧠 Smart analysis for user ${user.id} (${rateLimit.remaining} requests remaining)`);

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Smart AI analysis is not configured.' })
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

        const mediaType = matches[1];
        const base64Data = matches[2];

        // User-provided context about the food (optional)
        const userContext = details ? details.trim() : null;

        // Initialize Anthropic client
        const anthropic = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });

        console.log('🧠 Calling Claude 3.5 Sonnet for smart food analysis...');

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

        const message = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            temperature: 0.2, // Low temperature for precise analysis
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: mediaType,
                                data: base64Data
                            }
                        },
                        {
                            type: "text",
                            text: analysisPrompt
                        }
                    ]
                }
            ]
        });

        console.log('✅ Claude response received');

        // Extract text from response
        const content = message.content[0].text;
        console.log('Claude response:', content.substring(0, 200));

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
                foods = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Could not parse Claude response:', trimmedContent);
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
                model: 'claude-3-5-sonnet',
                smart: true
            })
        };

    } catch (error) {
        console.error('Error in smart food analysis:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Smart analysis failed',
                details: error.message
            })
        };
    }
};
