// Smart food photo analysis using Claude Sonnet (higher accuracy with weight-based estimation)
const Anthropic = require('@anthropic-ai/sdk');
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

        // Rate limit - 10 smart analyses per minute per user
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
                body: JSON.stringify({ error: 'Smart AI analysis is not configured. Please add ANTHROPIC_API_KEY to environment variables.' })
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

        console.log('🧠 Calling Claude Sonnet for smart food analysis...');

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

STEP 1 - ESTIMATE WEIGHT:
- Use visual references to estimate portion weight: dinner plate ~10in diameter, fork ~7in, standard bowl ~2 cups
- For countable items (dumplings, nuggets, meatballs, cookies, sushi pieces, etc.):
  * First estimate the weight of ONE piece based on its size (e.g., a steamed dumpling is typically 25-35g, a chicken nugget is ~18g, a sushi roll piece is ~30-40g)
  * Then count the number of pieces
  * Total weight = weight per piece × count
- For non-countable items, estimate total weight in grams or ounces

STEP 2 - CALCULATE NUTRITION:
- Use USDA nutritional density values (per 100g) as your reference:
  * Steamed pork dumplings: ~170-190 kcal/100g (~45-55 kcal per piece)
  * Steamed shrimp dumplings: ~150-170 kcal/100g (~40-50 kcal per piece)
  * Fried dumplings/gyoza: ~230-260 kcal/100g (~60-75 kcal per piece)
  * Grilled chicken breast: ~165 kcal/100g
  * White rice: ~130 kcal/100g
  * Salmon: ~180-210 kcal/100g
- Calculate: (weight in g / 100) × kcal per 100g = total calories
- Do the same for protein, carbs, and fat

STEP 3 - CROSS-CHECK:
- Verify: (protein × 4) + (carbs × 4) + (fat × 9) should approximately equal your calorie estimate (within 10%)
- If the math doesn't check out, adjust your estimates until it does

ADDITIONAL GUIDELINES:
- Account for cooking methods (grilled vs fried vs steamed affects calories significantly)
- Consider visible fats, oils, sauces, and dressings
- If skin is visible on meat, account for it
- Round calories to nearest 5, macros to nearest gram
- If multiple items are visible, list each separately
- If the user provided details, prioritize using that information
- Return empty array [] if no food is visible

Take your time to be accurate. Return ONLY the JSON array.`;

        // Build content array for Claude
        const contentParts = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64Data
                }
            },
            {
                type: 'text',
                text: analysisPrompt
            }
        ];

        let message;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
            message = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250514',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: contentParts
                }]
            });
        } catch (apiError) {
            console.error('Claude API error:', apiError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis request failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        console.log('✅ Claude Sonnet response received');

        const content = message.content?.[0]?.text || '';
        if (!content) {
            console.error('No content from Claude:', JSON.stringify(message).substring(0, 500));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ foods: [], model: 'claude-haiku', smart: true })
            };
        }

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
                try {
                    foods = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('Could not parse extracted JSON:', e);
                }
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
                model: 'claude-sonnet',
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
