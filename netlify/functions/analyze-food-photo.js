// Food photo analysis using Claude (Anthropic)
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
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

        // Rate limit - 20 photo analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-photo', 20, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id}`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`📸 Photo analysis for user ${user.id}`);

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured. Please add ANTHROPIC_API_KEY.' })
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

        console.log(`📷 Image size: ${base64Data.length} bytes, type: ${mediaType}`);

        // User-provided context
        const userContext = details ? details.trim() : null;

        // Initialize Anthropic client
        let anthropic;
        try {
            anthropic = new Anthropic({
                apiKey: ANTHROPIC_API_KEY,
            });
        } catch (initError) {
            console.error('Failed to initialize Anthropic client:', initError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to initialize AI client', details: initError.message })
            };
        }

        console.log('🤖 Calling Claude for food analysis...');

        // Build prompt
        const analysisPrompt = `Analyze this food image and identify all food items visible. For each item, estimate the nutritional information.
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

Return ONLY the JSON array.`;

        let message;
        try {
            message = await anthropic.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1024,
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
        } catch (apiError) {
            console.error('Anthropic API error:', apiError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis request failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        console.log('✅ Claude response received');

        // Extract response
        const content = message.content[0].text;
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
