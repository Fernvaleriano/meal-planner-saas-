// Progress photo comparison analysis using Claude Vision
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

// Fetch image from URL and convert to base64
async function fetchImageAsBase64(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return { base64, mimeType: contentType };
}

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

        // Rate limit - 10 analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-progress-photos', 10, 60000);
        if (!rateLimit.allowed) {
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!ANTHROPIC_API_KEY) {
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

        const { photoUrl1, photoUrl2, photoType, date1, date2 } = body;

        if (!photoUrl1 || !photoUrl2) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Two photo URLs are required' })
            };
        }

        // Fetch both images in parallel
        const [img1, img2] = await Promise.all([
            fetchImageAsBase64(photoUrl1),
            fetchImageAsBase64(photoUrl2)
        ]);

        // Calculate time span
        let timeSpan = '';
        if (date1 && date2) {
            const d1 = new Date(date1);
            const d2 = new Date(date2);
            const diffDays = Math.abs(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
            if (diffDays < 7) {
                timeSpan = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
            } else if (diffDays < 30) {
                const weeks = Math.round(diffDays / 7);
                timeSpan = `${weeks} week${weeks !== 1 ? 's' : ''}`;
            } else {
                const months = Math.round(diffDays / 30);
                timeSpan = `${months} month${months !== 1 ? 's' : ''}`;
            }
        }

        const photoTypeLabel = photoType && photoType !== 'progress'
            ? `${photoType} view`
            : 'progress';

        const prompt = `You are a supportive and knowledgeable fitness coach reviewing a client's ${photoTypeLabel} progress photos.

The FIRST image is the EARLIER photo${date1 ? ` (from ${date1})` : ''}.
The SECOND image is the MORE RECENT photo${date2 ? ` (from ${date2})` : ''}.
${timeSpan ? `Time between photos: approximately ${timeSpan}.` : ''}

Analyze the visible differences between these two photos. Focus on:
- Changes in muscle definition and tone
- Changes in body composition (visible fat loss or muscle gain)
- Posture improvements
- Overall physique changes

Guidelines:
- Be encouraging, positive, and constructive
- Only comment on what is visually apparent — do not guess weight numbers
- If changes are subtle, acknowledge the effort and consistency
- Keep your response to 3-5 sentences
- Do NOT use markdown formatting (no bold, italic, headers, or bullets)
- Write in a natural, conversational tone as if speaking directly to the client

Provide your analysis as plain text.`;

        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: img1.mimeType,
                            data: img1.base64
                        }
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: img2.mimeType,
                            data: img2.base64
                        }
                    },
                    {
                        type: 'text',
                        text: prompt
                    }
                ]
            }]
        });

        const analysis = message.content?.[0]?.text || '';

        if (!analysis) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ analysis: 'Unable to generate analysis for these photos. Please try again.' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ analysis: analysis.trim() })
        };

    } catch (error) {
        console.error('Error analyzing progress photos:', error);

        const isOverloaded = error.status === 529 || error.error?.type === 'overloaded_error';
        const isRateLimit = error.status === 429;

        return {
            statusCode: isOverloaded ? 503 : isRateLimit ? 429 : 500,
            headers,
            body: JSON.stringify({
                error: isOverloaded
                    ? 'AI service is temporarily busy. Please try again in a moment.'
                    : isRateLimit
                    ? 'AI rate limit reached. Please wait a moment and try again.'
                    : 'Failed to analyze photos. Please try again.'
            })
        };
    }
};
