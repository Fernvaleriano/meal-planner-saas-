const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

/**
 * Use Claude AI to extract structured recipe data from transcript
 */
async function extractRecipeFromTranscript(transcript, videoTitle) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Truncate very long transcripts to avoid token limits
    const maxLen = 8000;
    const truncated = transcript.length > maxLen
        ? transcript.substring(0, maxLen) + '...'
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
"${truncated}"

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
    const { coachId, youtubeUrl, transcript, videoTitle } = body;

    if (!coachId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'coachId is required' })
        };
    }

    if (!transcript || transcript.length < 10) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'transcript is required and must have content' })
        };
    }

    // Authenticate coach
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    try {
        console.log(`Extracting recipe from transcript: ${transcript.length} chars, title: "${videoTitle}"`);

        const recipe = await extractRecipeFromTranscript(transcript, videoTitle || '');

        // Build thumbnail URL from YouTube URL if possible
        let thumbnailUrl = null;
        if (youtubeUrl) {
            const patterns = [
                /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
                /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
                /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            ];
            for (const p of patterns) {
                const m = youtubeUrl.match(p);
                if (m) { thumbnailUrl = `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`; break; }
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                recipe: {
                    ...recipe,
                    image_url: thumbnailUrl,
                    source_url: youtubeUrl || null
                },
                videoTitle: videoTitle || '',
                thumbnailUrl,
                transcriptLength: transcript.length
            })
        };
    } catch (err) {
        console.error('Error extracting recipe:', err.message, err.stack);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to extract recipe from transcript. Please try again or enter the recipe manually.'
            })
        };
    }
};
