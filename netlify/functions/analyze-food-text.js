// Text-based food analysis using Claude Haiku (matches photo analysis provider)
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

        // Rate limit - 30 text analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-text', 30, 60000);
        if (!rateLimit.allowed) {
            console.warn(`Rate limit exceeded for user ${user.id}`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured.' })
            };
        }

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

        const { text } = body;

        if (!text || !text.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No food description provided' })
            };
        }

        const foodDescription = text.trim();

        const prompt = `You are a nutrition expert. The user is describing what they ate. Parse their description and estimate the nutritional information for each food item mentioned.

User's food description: "${foodDescription}"

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
- Be specific about portions based on context (e.g., "Coffee with cream, 12oz" or "Scrambled Eggs, 2 large")
- If no portion is mentioned, assume a typical serving size
- Round calories to nearest 5, macros to nearest gram
- List each food item separately (e.g., "coffee and eggs" becomes two items)
- Use common sense for preparations (e.g., "fried eggs" vs "boiled eggs" have different fat)
- If the description is unclear, make reasonable assumptions based on typical meals
- Return empty array [] if no food items can be identified

Return ONLY the JSON array, nothing else.`;

        console.log(`Text food analysis for user ${user.id}`);

        let content;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });
            content = message.content?.[0]?.text || '';
        } catch (apiError) {
            console.error('Anthropic API error:', apiError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        console.log('Claude response:', content);

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from the response
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
            body: JSON.stringify({ foods })
        };

    } catch (error) {
        console.error('Error analyzing food text:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to analyze food description',
                details: error.message
            })
        };
    }
};
