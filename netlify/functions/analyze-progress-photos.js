// Progress photo comparison analysis using Gemini 2.5 Flash Vision
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

        // Determine if dates are the same
        const sameDate = date1 && date2 && date1 === date2;

        const prompt = sameDate
            ? `You are a progress tracking assistant for a fitness coaching SaaS application called Ziquecoach. This is a legitimate, professional fitness coaching platform where certified coaches manage their clients' training programs.

One core feature is progress photo tracking. Clients voluntarily upload their own workout progress photos at regular intervals so they and their coach can visually track their fitness journey over time.

A client on our fitness coaching platform has uploaded these two ${photoTypeLabel} progress photos for comparison.

Please compare these two photos and note any visible differences — things like posture, overall shape, muscle definition, or any other noticeable changes. The client wants to see how these two photos compare. Be encouraging and supportive. Keep it to 3-5 sentences, plain text only (no markdown, no bullet points).`
            : `You are a progress tracking assistant for a fitness coaching SaaS application called Ziquecoach. This is a legitimate, professional fitness coaching platform where certified coaches manage their clients' training programs.

One core feature is progress photo tracking. Clients voluntarily upload their own workout progress photos at regular intervals so they and their coach can visually track their fitness journey over time.

A client on our fitness coaching platform has uploaded these two ${photoTypeLabel} progress photos for their routine check-in.

Photo 1 (earlier): ${date1 ? `taken ${date1}` : 'earlier photo'}
Photo 2 (more recent): ${date2 ? `taken ${date2}` : 'more recent photo'}
${timeSpan ? `Time between photos: approximately ${timeSpan}` : ''}

Please provide a brief progress update for this client. Note any visible changes you observe between the two photos — things like posture, overall shape, or any noticeable differences. Be encouraging and supportive. Keep it to 3-5 sentences, plain text only (no markdown, no bullet points).`;

        // Build Gemini request with inline images
        const parts = [
            {
                inline_data: {
                    mime_type: img1.mimeType,
                    data: img1.base64
                }
            },
            {
                inline_data: {
                    mime_type: img2.mimeType,
                    data: img2.base64
                }
            },
            { text: prompt }
        ];

        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 512,
                    thinkingConfig: {
                        thinkingBudget: 0
                    }
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('Gemini API error:', errorText);
            throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const data = await geminiResponse.json();

        // Extract response text - handle thinking parts from Gemini 2.5+
        if (!data.candidates || !data.candidates[0]?.content?.parts?.length) {
            console.error('Invalid Gemini response:', JSON.stringify(data).substring(0, 500));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ analysis: 'Unable to generate analysis for these photos. Please try again.' })
            };
        }

        const allParts = data.candidates[0].content.parts;
        const outputParts = allParts.filter(p => !p.thought && p.text);
        const contentPart = outputParts.length > 0
            ? outputParts[outputParts.length - 1]
            : allParts.find(p => p.text);
        const analysis = contentPart?.text?.trim() || '';

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
            body: JSON.stringify({ analysis })
        };

    } catch (error) {
        console.error('Error analyzing progress photos:', error);

        const isRateLimit = error.status === 429;

        return {
            statusCode: isRateLimit ? 429 : 500,
            headers,
            body: JSON.stringify({
                error: isRateLimit
                    ? 'AI rate limit reached. Please wait a moment and try again.'
                    : 'Failed to analyze photos. Please try again.'
            })
        };
    }
};
