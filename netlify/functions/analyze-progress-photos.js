// Progress photo comparison analysis using Gemini 2.5 Flash-Lite Vision
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

// Max image size: 4MB (Gemini accepts up to 20MB but we want to keep payloads reasonable)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Fetch image from URL and convert to base64
async function fetchImageAsBase64(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load photo (status ${response.status}). The image may have expired — try re-uploading it.`);

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
        throw new Error('One of the selected files is not an image.');
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error('One of the photos is too large for analysis. Please upload a smaller image.');
    }

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

        // Rate limit - 5 analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-progress-photos', 5, 60000);
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

        const coachContext = `You are an experienced fitness and physique coach providing a detailed photo comparison analysis on the Ziquecoach platform — a professional fitness coaching SaaS where certified coaches manage their clients' training programs.

One core feature is progress photo tracking. Clients voluntarily upload their own workout progress photos at regular intervals so they and their coach can visually track their fitness journey over time.

Analyze these two ${photoTypeLabel} photos the way a real coach would during a check-in. Be specific, observant, and thorough. Use your expertise to call out details a client might miss.`;

        const coachInstructions = `IMPORTANT CHECKS — run these BEFORE analyzing. If any apply, give a short response and STOP:
1. NOT A FITNESS PHOTO: If either photo isn't a body/physique photo, say so and STOP.
2. DIFFERENT PEOPLE: If the photos are clearly different people, say so and STOP.
3. NO VISIBLE CHANGE: If photos look identical, say "no visible changes yet — keep grinding!" and STOP.
4. VERY DIFFERENT ANGLES: If angles are too different to compare fairly, note it and only comment on what's comparable.
5. LIGHTING/CLOTHING DIFFERENCE: If lighting or clothing differs significantly, mention it briefly.

Keep your analysis SHORT — 3 to 4 brief paragraphs max (aim for around 150 words total). Cover:
- The 1-2 most noticeable changes (muscle, leanness, shape, posture — whatever stands out most)
- A quick overall verdict

Never invent or exaggerate progress. If you see regression (weight gain, lost definition), say so honestly and constructively — a good coach tells the truth.

Tone: direct, specific, motivating. Skip generic praise. Get excited about real progress, acknowledge the grind for subtle changes, address setbacks head-on.

Format as plain text with short paragraph breaks. No markdown, no headers, no bullet points.`;`;

        const prompt = sameDate
            ? `${coachContext}

The client has uploaded these two photos for a side-by-side comparison. Both were logged on the same date — the user selected Photo 1 as "before" and Photo 2 as "after", so trust their ordering.

${coachInstructions}`
            : `${coachContext}

Photo 1 (before): ${date1 ? `taken ${date1}` : 'before photo'}
Photo 2 (after): ${date2 ? `taken ${date2}` : 'after photo'}
${timeSpan ? `Time between photos: approximately ${timeSpan}` : ''}

${coachInstructions}`;

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
                    maxOutputTokens: 400,
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
