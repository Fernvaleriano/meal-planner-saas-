const Anthropic = require('@anthropic-ai/sdk');
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
 * Fetch YouTube transcript using the innertube API
 */
async function fetchTranscript(videoId) {
    // First, fetch the video page to get the initial player response
    const videoPageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    if (!videoPageRes.ok) {
        throw new Error('Failed to fetch YouTube video page');
    }

    const html = await videoPageRes.text();

    // Extract the serialized player response
    const ytInitialPlayerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!ytInitialPlayerMatch) {
        throw new Error('Could not parse video page data');
    }

    let playerResponse;
    try {
        playerResponse = JSON.parse(ytInitialPlayerMatch[1]);
    } catch {
        throw new Error('Could not parse player response JSON');
    }

    // Get video title and thumbnail
    const videoTitle = playerResponse?.videoDetails?.title || '';
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Check for captions
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
        throw new Error('NO_CAPTIONS');
    }

    // Prefer English captions, then auto-generated English, then first available
    let captionTrack = captionTracks.find(t => t.languageCode === 'en' && !t.kind);
    if (!captionTrack) {
        captionTrack = captionTracks.find(t => t.languageCode === 'en');
    }
    if (!captionTrack) {
        captionTrack = captionTracks[0];
    }

    // Fetch the caption XML
    const captionUrl = captionTrack.baseUrl;
    const captionRes = await fetch(captionUrl);
    if (!captionRes.ok) {
        throw new Error('Failed to fetch captions');
    }

    const captionXml = await captionRes.text();

    // Parse XML to extract text (simple regex-based parsing for the <text> elements)
    const textSegments = [];
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let match;
    while ((match = textRegex.exec(captionXml)) !== null) {
        // Decode HTML entities
        const decoded = match[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n/g, ' ')
            .trim();
        if (decoded) textSegments.push(decoded);
    }

    const transcript = textSegments.join(' ');

    if (!transcript || transcript.length < 10) {
        throw new Error('NO_CAPTIONS');
    }

    return { transcript, videoTitle, thumbnailUrl };
}

/**
 * Use Claude AI to extract structured recipe data from transcript
 */
async function extractRecipeFromTranscript(transcript, videoTitle) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
            {
                role: 'user',
                content: `You are a recipe extraction assistant. Given a YouTube video transcript about cooking/food, extract the recipe information.

Video title: "${videoTitle}"

Transcript:
"${transcript}"

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
        const { transcript, videoTitle, thumbnailUrl } = await fetchTranscript(videoId);

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
        console.error('Error extracting recipe:', err);

        if (err.message === 'NO_CAPTIONS') {
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
