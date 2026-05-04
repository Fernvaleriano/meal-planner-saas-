// Scale photo analysis using Gemini 2.5 Flash — reads weight off a scale display
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    try {
        const corsResponse = handleCors(event);
        if (corsResponse) return corsResponse;

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        const rateLimit = checkRateLimit(user.id, 'analyze-scale-photo', 20, 60000);
        if (!rateLimit.allowed) {
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!GEMINI_API_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured.' })
            };
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }

        const { image } = body;
        if (!image) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No image provided' })
            };
        }

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

        const analysisPrompt = `You are reading a body-weight reading from a bathroom scale display.

Look carefully at the scale and extract the weight value shown.

Return ONLY a valid JSON object with this exact format (no markdown, no explanation, no code blocks):
{
  "weight": 172.4,
  "unit": "lbs",
  "confidence": "high"
}

Important:
- weight must be a number (the numeric value displayed). Use a decimal if shown.
- unit must be one of: "lbs", "kg", or "stone". Infer from any unit text on the display, or from typical scale ranges (60-400 likely lbs, 30-200 likely kg). Default to "lbs" if uncertain.
- confidence must be one of: "high" (display is clear and unambiguous), "medium" (some glare/blur but readable), "low" (hard to read, partially visible, or you had to guess)
- If the photo does not show a scale, or you cannot read any number at all, return: {"error": "No scale reading detected"}
- Do NOT include text, units, or anything except the JSON.

Return ONLY the JSON object, nothing else.`;

        const parts = [
            { text: analysisPrompt },
            {
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            }
        ];

        let response;
        try {
            response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 256,
                        responseMimeType: 'application/json',
                        thinkingConfig: { thinkingBudget: 0 }
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

        if (!data.candidates || !data.candidates[0]?.content?.parts?.length) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Invalid AI response structure' })
            };
        }

        const allParts = data.candidates[0].content.parts;
        const outputParts = allParts.filter(p => !p.thought && p.text);
        const contentPart = outputParts.length > 0
            ? outputParts[outputParts.length - 1]
            : allParts.find(p => p.text);
        const content = contentPart?.text;

        if (!content) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Invalid AI response - no text content' })
            };
        }

        let result;
        const trimmedContent = content.trim();
        try {
            result = JSON.parse(trimmedContent);
        } catch {
            const cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();
            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Could not read scale. Please try a clearer photo.' })
                    };
                }
            } else {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Could not read scale. Please try a clearer photo.' })
                };
            }
        }

        if (result.error) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: result.error })
            };
        }

        const weight = typeof result.weight === 'number' ? result.weight : parseFloat(result.weight);
        if (!weight || isNaN(weight) || weight <= 0 || weight > 1000) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Could not read a valid weight from the scale.' })
            };
        }

        const allowedUnits = ['lbs', 'kg', 'stone'];
        const unit = allowedUnits.includes(result.unit) ? result.unit : 'lbs';
        const confidence = ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'medium';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                weight: Math.round(weight * 10) / 10,
                unit,
                confidence
            })
        };

    } catch (error) {
        console.error('Error in scale photo analysis:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Scale analysis failed',
                details: error.message || 'Unknown error'
            })
        };
    }
};
