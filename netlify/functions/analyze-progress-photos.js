// Progress photo comparison analysis using Gemini 2.5 Flash Vision
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

        const coachInstructions = `Provide your analysis covering these areas (skip any that aren't visible or applicable for the photo angle):

MUSCLE DEVELOPMENT: Identify specific muscle groups that show visible change — shoulders/delts, arms (biceps, triceps), chest, back/lats, core/midsection, glutes, quads, hamstrings, calves. Note where you see more size, definition, separation, or symmetry improvements.

BODY COMPOSITION: Comment on visible changes in leanness, fat distribution, or overall tightness. Note areas where the client appears to be leaning out or filling out with muscle.

POSTURE & STRUCTURE: Note any changes in posture, shoulder positioning, how they carry themselves, or overall frame appearance.

STANDOUT IMPROVEMENTS: Call out the 1-2 most impressive changes — the things that jump out immediately when comparing the photos.

OVERALL ASSESSMENT: Give a brief overall coach's verdict on the progress.

IMPORTANT CHECKS — run these BEFORE doing a full analysis. If any apply, give a short response and STOP:

1. NOT A FITNESS PHOTO: If either photo is not a body/physique photo (e.g. a screenshot, food pic, pet, random image), say something like "One of these doesn't look like a progress photo — double-check your selection and try again!" and STOP.

2. DIFFERENT PEOPLE: If the two photos clearly appear to be different people (different body type, skin tone, tattoos, setting suggesting different individuals, etc.), say something like "Heads up — these two photos don't look like the same person to me. Double-check you selected the right photos and try again!" and STOP.

3. NO VISIBLE CHANGE: If the two photos look identical or nearly identical, just say something short like "These two photos look essentially the same to me — no visible changes to call out yet. Keep grinding and we'll compare again soon!" and STOP. Do NOT go through each section repeating that there's no change.

4. VERY DIFFERENT ANGLES: If the photos are taken from significantly different angles (e.g. front vs back, or front vs side), note upfront that a direct comparison is limited because of the angle difference, then only comment on what IS comparable between the two.

5. LIGHTING OR CLOTHING DIFFERENCE: If one photo has dramatically different lighting, a filter, or different clothing coverage (e.g. shirtless vs wearing a shirt), mention it briefly so the client knows it affects the comparison. Do NOT attribute lighting changes to actual body composition changes.

Never invent or exaggerate progress that doesn't exist. Credibility matters more than positivity.

HONESTY ABOUT SETBACKS: If you see visible weight gain, increased body fat, loss of muscle definition, or any regression compared to the earlier photo, you MUST say so clearly and professionally. Do not sugarcoat or ignore it. A good coach tells their client the truth. Frame it constructively — acknowledge it directly, suggest it may be worth reviewing nutrition or training consistency, and remind them that setbacks are part of the journey and can be corrected. But never pretend regression is progress or skip over it to stay positive.

Keep the tone real and direct like a coach who genuinely cares — honest, specific, and motivating. Avoid generic praise. If you see real progress, get excited about it. If changes are subtle, acknowledge the grind and point out the small wins. If you see regression, address it head-on with respect and a plan to course-correct.

Format the response as plain text with short paragraph breaks between sections. Do NOT use markdown headers, bullet points, or bold text. Use natural section transitions instead (e.g. start paragraphs with phrases like "Looking at your shoulders..." or "From a body comp standpoint..." or "The thing that jumps out most...").`;

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
                    maxOutputTokens: 1024,
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
