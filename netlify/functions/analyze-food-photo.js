// Food photo analysis using Claude Haiku (better accuracy than Gemini for food analysis)
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

        console.log('🤖 Calling Claude Haiku for food analysis...');

        // Build content array with images for Claude
        const contentParts = [
            ...processedImages.map((img) => ({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: img.mimeType,
                    data: img.base64Data
                }
            })),
            {
                type: 'text',
                text: analysisPrompt
            }
        ];

        let message;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
            message = await anthropic.messages.create({
                model: 'claude-3-haiku-20240307',
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

        console.log('✅ Claude Haiku response received');

        // Extract response text
        const content = message.content?.[0]?.text || '';
        if (!content) {
            console.error('No content from Claude:', JSON.stringify(message).substring(0, 500));
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
