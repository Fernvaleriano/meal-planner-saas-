const Anthropic = require('@anthropic-ai/sdk');
const { YoutubeTranscript } = require('youtube-transcript');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url) {
    const patterns = [
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Fetch YouTube transcript using the youtube-transcript package
 */
async function fetchTranscript(videoId) {
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Use the youtube-transcript package which handles all the innertube complexity
    let transcriptItems;
    try {
        transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    } catch (engErr) {
        console.log('English captions not found, trying any language:', engErr.message);
        try {
            transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        } catch (anyErr) {
            console.error('No captions found at all:', anyErr.message);
            throw new Error('NO_CAPTIONS');
        }
    }

    if (!transcriptItems || transcriptItems.length === 0) {
        throw new Error('NO_CAPTIONS');
    }

    const transcript = transcriptItems.map(item => item.text).join(' ');

    if (transcript.length < 10) {
        throw new Error('NO_CAPTIONS');
    }

    // Try to get video title from the page
    let videoTitle = '';
    try {
        const pageRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (pageRes.ok) {
            const data = await pageRes.json();
            videoTitle = data.title || '';
        }
    } catch {
        // Title is optional, continue without it
    }

    return { transcript, videoTitle, thumbnailUrl };
}

/**
 * Use Claude AI to extract structured recipe data from transcript
 */
async function extractRecipeFromTranscript(transcript, videoTitle) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Truncate very long transcripts to avoid token limits
    const maxTranscriptLength = 8000;
    const truncatedTranscript = transcript.length > maxTranscriptLength
        ? transcript.substring(0, maxTranscriptLength) + '...'
        : transcript;

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
            {
                role: 'user',
                content: `You are a recipe extraction assistant. Given a YouTube video transcript about cooking/food, extract the recipe information.

Video title: "${videoTitle}"

Transcript:
"${truncatedTranscript}"

Extract and return a JSON object with these fields:
- name: Recipe name (string, create a clear name based on the content)
- description: Brief 1-2 sentence description of the dish (string)
- time_category: One of "grab_go", "quick", "meal_prep", or "family" based on complexity
- prep_time_minutes: Estimated prep time in minutes (number or null)
- cook_time_minutes: Estimated cook time in minutes (number or null)
- servings: Number of servings (number, default 1)
- calories: Estimated calories per serving (number or null)
- protein: Estimated protein grams per serving (number or null)
- carbs: Estimated carb grams per serving (number or null)
- fat: Estimated fat grams per serving (number or null)
- ingredients: Each ingredient on its own line with quantities (string with \\n separators)
- instructions: Step-by-step instructions, numbered (string with \\n separators)

Important:
- For nutrition estimates, use your knowledge of common food nutrition. If the video mentions specific macros, use those.
- If the transcript doesn't contain a clear recipe, still try to extract what food items and preparation steps are mentioned.
- Return ONLY the JSON object, no markdown formatting or code blocks.`
            }
        ]
    });

    const responseText = message.content[0].text.trim();

    // Try to parse the JSON, handling potential markdown code blocks
    let jsonStr = responseText;
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    }

    return JSON.parse(jsonStr);
}

exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { coachId, youtubeUrl } = body;

    if (!coachId || !youtubeUrl) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'coachId and youtubeUrl are required' })
        };
    }

    // Authenticate coach
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    // Extract video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid YouTube URL. Please paste a valid YouTube or YouTube Shorts link.' })
        };
    }

    try {
        // Fetch transcript
        console.log(`Fetching transcript for video: ${videoId}`);
        const { transcript, videoTitle, thumbnailUrl } = await fetchTranscript(videoId);
        console.log(`Transcript fetched: ${transcript.length} chars, title: "${videoTitle}"`);

        // Extract recipe using Claude AI
        const recipe = await extractRecipeFromTranscript(transcript, videoTitle);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                recipe: {
                    ...recipe,
                    image_url: thumbnailUrl,
                    source_url: youtubeUrl
                },
                videoTitle,
                thumbnailUrl,
                transcriptLength: transcript.length
            })
        };
    } catch (err) {
        console.error('Error extracting recipe:', err.message, err.stack);

        if (err.message === 'NO_CAPTIONS' || err.message?.includes('Could not get the transcript') || err.message?.includes('Transcript is disabled')) {
            return {
                statusCode: 422,
                headers,
                body: JSON.stringify({
                    error: 'This video does not have captions/subtitles available. Try a different video, or manually enter the recipe details.',
                    code: 'NO_CAPTIONS'
                })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to extract recipe from video. Please try again or enter the recipe manually.'
            })
        };
    }
};
