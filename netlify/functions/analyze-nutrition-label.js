// Nutrition label analysis using Gemini 2.5 Flash
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

        // Rate limit - 20 label scans per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-nutrition-label', 20, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-nutrition-label`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        console.log(`📋 Nutrition label scan for user ${user.id} (${rateLimit.remaining} requests remaining)`);

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured.' })
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
        const { image, images } = body;
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

        console.log(`📋 Processing ${processedImages.length} image(s) for nutrition label analysis`);

        console.log('📋 Calling Gemini to read nutrition label...');

        // Build the prompt for nutrition label reading
        const multiImageNote = processedImages.length > 1
            ? `You are viewing ${processedImages.length} images of a food product from different angles. Use ALL images together to get the most accurate information - one may show the nutrition facts, another may show the product name or front of package.`
            : 'You are reading a nutrition facts label from a food product.';

        const analysisPrompt = `${multiImageNote} Extract the nutritional information accurately.

Look for and extract:
1. Product name (from the label or packaging if visible)
2. Serving size as a number and unit separately (e.g., for "1 cup" use servingSize: 1 and servingUnit: "cup", for "2 cookies" use servingSize: 2 and servingUnit: "cookies", for "100g" use servingSize: 100 and servingUnit: "g")
3. Calories per serving
4. Protein (in grams)
5. Total Carbohydrates (in grams)
6. Total Fat (in grams)

Return ONLY a valid JSON object with this exact format (no markdown, no explanation, no code blocks):
{
  "name": "Product name or generic description",
  "servingSize": 1,
  "servingUnit": "cup",
  "calories": 000,
  "protein": 00,
  "carbs": 00,
  "fat": 00
}

Important:
- Use the exact values from the label, don't estimate
- If the product name is not visible, use a generic description based on what you can see
- servingSize must be a number (the numeric portion of the serving size)
- servingUnit must be a string (the unit portion like "cup", "g", "oz", "cookies", "pieces", "serving")
- Round calories, protein, carbs, and fat to whole numbers
- If a value is not visible or unclear, use 0
- If this is NOT a nutrition label, return: {"error": "No nutrition label detected"}

Return ONLY the JSON object, nothing else.`;

        // Build parts array for Gemini
        const parts = [
            { text: analysisPrompt },
            ...processedImages.map((img) => ({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.base64Data
                }
            }))
        ];

        let response;
        try {
            response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 512,
                        responseMimeType: 'application/json',
                        thinkingConfig: {
                            thinkingBudget: 0
                        }
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API error:', errorText);
                throw new Error(`Gemini API error: ${response.status}`);
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

        const data = await response.json();
        console.log('✅ Gemini response received');

        // Extract response text - handle thinking parts from Gemini 2.5+
        if (!data.candidates || !data.candidates[0]?.content?.parts?.length) {
            console.error('Invalid Gemini response structure:', JSON.stringify(data).substring(0, 500));
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Invalid AI response structure' })
            };
        }

        // Filter out thinking/thought parts and get the actual output text
        const allParts = data.candidates[0].content.parts;
        const outputParts = allParts.filter(p => !p.thought && p.text);
        const contentPart = outputParts.length > 0
            ? outputParts[outputParts.length - 1]
            : allParts.find(p => p.text);
        const content = contentPart?.text;

        if (!content) {
            console.error('No text content in Gemini response parts:', JSON.stringify(allParts).substring(0, 500));
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Invalid AI response - no text content' })
            };
        }

        console.log('Gemini response:', content.substring(0, 300));

        // Parse the response
        let result;
        const trimmedContent = content.trim();

        try {
            result = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from markdown code blocks
            let cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.error('Could not parse extracted JSON:', e);
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Could not read nutrition label. Please try a clearer photo.' })
                    };
                }
            } else {
                console.error('Could not parse Gemini response:', trimmedContent);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Could not read nutrition label. Please try a clearer photo.' })
                };
            }
        }

        // Check for error response
        if (result.error) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: result.error })
            };
        }

        // Validate and clean the data
        // Handle servingSize: could be a number (new format) or string (legacy format)
        let servingSize = 1;
        let servingUnit = 'serving';

        if (typeof result.servingSize === 'number' && result.servingSize > 0) {
            servingSize = result.servingSize;
            servingUnit = (result.servingUnit || 'serving').substring(0, 50);
        } else if (typeof result.servingSize === 'string') {
            // Parse legacy string format like "1 cup", "2 cookies", "100g"
            const match = result.servingSize.match(/^([\d.]+)\s*(.+)$/);
            if (match) {
                servingSize = parseFloat(match[1]) || 1;
                servingUnit = match[2].trim().substring(0, 50);
            } else {
                servingUnit = result.servingSize.substring(0, 50);
            }
        }

        const nutritionData = {
            name: (result.name || 'Food Item').substring(0, 100),
            servingSize: servingSize,
            servingUnit: servingUnit,
            calories: Math.max(0, Math.round(result.calories || 0)),
            protein: Math.max(0, Math.round(result.protein || 0)),
            carbs: Math.max(0, Math.round(result.carbs || 0)),
            fat: Math.max(0, Math.round(result.fat || 0))
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(nutritionData)
        };

    } catch (error) {
        console.error('Error in nutrition label analysis:', error);
        console.error('Error stack:', error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Label analysis failed',
                details: error.message || 'Unknown error'
            })
        };
    }
};
