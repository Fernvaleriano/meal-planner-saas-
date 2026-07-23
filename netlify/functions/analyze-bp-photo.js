// Blood-pressure monitor photo analysis using Gemini 2.5 Flash — reads the
// systolic / diastolic / pulse values off a home BP monitor display.
const { handleCors, authenticateRequest, checkRateLimitDurable, rateLimitResponse, corsHeaders } = require('./utils/auth');

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

        const rateLimit = await checkRateLimitDurable(user.id, 'analyze-bp-photo', 20, 60000);
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

        const analysisPrompt = `You are reading a blood-pressure reading from a home blood-pressure monitor display (e.g. Omron).

The display typically shows three numbers, top to bottom:
- SYS (systolic) — the highest number, usually 80-220
- DIA (diastolic) — the middle number, usually 40-140
- PULSE (heart rate, /min) — often smaller / to the side, usually 40-180

Read the digits carefully and extract each value.

Return ONLY a valid JSON object with this exact format (no markdown, no explanation, no code blocks):
{
  "systolic": 137,
  "diastolic": 87,
  "pulse": 69,
  "confidence": "high"
}

Important:
- Each value must be a whole number (integer) matching the digits on the display.
- systolic is the top/largest number, diastolic is the middle number, pulse is the /min heart-rate number.
- If the pulse is not visible, use null for "pulse" but still return systolic and diastolic.
- confidence must be one of: "high" (display is clear and unambiguous), "medium" (some glare/blur but readable), "low" (hard to read, partially visible, or you had to guess).
- If the photo does not show a blood-pressure monitor, or you cannot read the systolic/diastolic numbers at all, return: {"error": "No blood pressure reading detected"}
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
                        body: JSON.stringify({ error: 'Could not read the monitor. Please try a clearer photo.' })
                    };
                }
            } else {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Could not read the monitor. Please try a clearer photo.' })
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

        const toInt = (v) => {
            const n = typeof v === 'number' ? v : parseInt(v, 10);
            return Number.isFinite(n) ? Math.round(n) : null;
        };

        const systolic = toInt(result.systolic);
        const diastolic = toInt(result.diastolic);
        let pulse = toInt(result.pulse);

        // Systolic + diastolic are required; sanity-check plausible ranges.
        if (!systolic || systolic < 50 || systolic > 300 ||
            !diastolic || diastolic < 30 || diastolic > 200) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Could not read a valid blood pressure from the monitor.' })
            };
        }

        // Pulse is optional — drop it if it's out of a believable range.
        if (pulse != null && (pulse < 25 || pulse > 250)) {
            pulse = null;
        }

        const confidence = ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'medium';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                systolic,
                diastolic,
                pulse,
                confidence
            })
        };

    } catch (error) {
        console.error('Error in BP photo analysis:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Blood pressure analysis failed',
                details: error.message || 'Unknown error'
            })
        };
    }
};
