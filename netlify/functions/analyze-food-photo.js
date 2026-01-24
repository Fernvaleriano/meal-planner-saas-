// Food photo analysis using Gemini 2.5 Flash (cost-effective vision model)
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Safety settings for Gemini API
const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
];

// Helper function to call Gemini API with image parts
async function callGeminiWithImages(parts, useSafetySettings = true) {
    const requestBody = {
        contents: [{ parts }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
        }
    };

    if (useSafetySettings) {
        requestBody.safetySettings = safetySettings;
    }

    return fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
}

// Helper to check if response was blocked by safety filters
function isSafetyBlocked(data) {
    const finishReason = data.candidates?.[0]?.finishReason;
    const hasBlockedReason = finishReason === 'SAFETY' || finishReason === 'BLOCKED';
    const hasEmptyContent = !data.candidates?.[0]?.content?.parts?.length;
    const hasPromptFeedback = data.promptFeedback?.blockReason;
    return hasBlockedReason || (hasEmptyContent && !data.error) || hasPromptFeedback;
}

// Helper to extract text content from Gemini response
function extractContent(data) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

        console.log('🤖 Calling Gemini for food analysis...');

        // Build image parts for Gemini
        const imageParts = processedImages.map((img) => ({
            inline_data: {
                mime_type: img.mimeType,
                data: img.base64Data
            }
        }));

        // Primary prompt parts
        const primaryParts = [{ text: analysisPrompt }, ...imageParts];

        // Simplified fallback prompt (less likely to trigger safety filters)
        const fallbackPrompt = `List the food items in this image with nutritional estimates.
${userContext ? `Context: ${userContext}` : ''}
Return JSON array: [{"name": "Food", "calories": 100, "protein": 10, "carbs": 10, "fat": 5}]`;
        const fallbackParts = [{ text: fallbackPrompt }, ...imageParts];

        let response;
        let data;
        let content;

        try {
            // Try primary prompt first
            response = await callGeminiWithImages(primaryParts, true);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API error:', errorText);
                throw new Error(`Gemini API error: ${response.status}`);
            }

            data = await response.json();
            content = extractContent(data);

            // Check if blocked by safety filters - retry with fallback prompt
            if (!content || isSafetyBlocked(data)) {
                const finishReason = data.candidates?.[0]?.finishReason || 'unknown';
                const blockReason = data.promptFeedback?.blockReason || 'none';
                console.log(`📸 Primary prompt blocked. finishReason: ${finishReason}, blockReason: ${blockReason}. Retrying...`);

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 500));

                // Try fallback prompt
                response = await callGeminiWithImages(fallbackParts, false);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Gemini API fallback error:', errorText);
                    throw new Error(`Gemini API error: ${response.status}`);
                }

                data = await response.json();
                content = extractContent(data);

                if (!content || isSafetyBlocked(data)) {
                    console.error('📸 Fallback also blocked. Full response:', JSON.stringify(data).substring(0, 500));
                } else {
                    console.log('📸 Fallback prompt succeeded');
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

        console.log('✅ Gemini response received');

        // Check if we got valid content
        if (!content) {
            console.error('No content in Gemini response:', JSON.stringify(data).substring(0, 500));
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
