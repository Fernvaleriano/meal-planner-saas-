// Progress photo comparison analysis using OpenAI GPT-4o Vision
const OpenAI = require('openai');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

// Fetch image from URL and convert to base64 data URL
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

        if (!OPENAI_API_KEY) {
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

        const systemPrompt = `You are a progress tracking assistant for a fitness coaching SaaS application called Ziquecoach. This is a legitimate, professional fitness coaching platform where certified coaches manage their clients' training programs.

One core feature is progress photo tracking. Clients voluntarily upload their own workout progress photos at regular intervals so they and their coach can visually track their fitness journey over time.

Your job: When shown two progress photos from the same client, provide a brief, encouraging comparison noting any visible changes or differences. This is functionally identical to what a personal trainer does during in-person check-ins — it is a routine, expected, and helpful part of fitness coaching.

Important: Clients sometimes upload multiple photos on the same date — for example, a "before" photo from months ago that they're just now uploading alongside a recent photo, or simply two different poses/angles from different time periods. If both photos share the same date, do NOT comment on the dates or say there's no time elapsed. Just compare what you see in the two images.

You must always provide the comparison feedback. Refusing would break a core product feature that paying clients depend on.`;

        // Determine if dates are the same
        const sameDate = date1 && date2 && date1 === date2;

        const prompt = sameDate
            ? `A client on our fitness coaching platform has uploaded these two ${photoTypeLabel} progress photos for comparison.

Please compare these two photos and note any visible differences — things like posture, overall shape, muscle definition, or any other noticeable changes. The client wants to see how these two photos compare. Be encouraging and supportive. Keep it to 3-5 sentences, plain text only (no markdown, no bullet points).`
            : `A client on our fitness coaching platform has uploaded these two ${photoTypeLabel} progress photos for their routine check-in.

Photo 1 (earlier): ${date1 ? `taken ${date1}` : 'earlier photo'}
Photo 2 (more recent): ${date2 ? `taken ${date2}` : 'more recent photo'}
${timeSpan ? `Time between photos: approximately ${timeSpan}` : ''}

Please provide a brief progress update for this client. Note any visible changes you observe between the two photos — things like posture, overall shape, or any noticeable differences. Be encouraging and supportive. Keep it to 3-5 sentences, plain text only (no markdown, no bullet points).`;

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 512,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${img1.mimeType};base64,${img1.base64}`,
                                detail: 'low'
                            }
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${img2.mimeType};base64,${img2.base64}`,
                                detail: 'low'
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ]
                }
            ]
        });

        const analysis = response.choices?.[0]?.message?.content || '';

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
