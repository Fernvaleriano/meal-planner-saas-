const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_25_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_20_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Safety settings - use OFF for 2.5 Flash (BLOCK_NONE doesn't work properly)
const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" }
];

// Helper to check if response was blocked
function isSafetyBlocked(data) {
    const finishReason = data.candidates?.[0]?.finishReason;
    const blocked = finishReason === 'SAFETY' || finishReason === 'BLOCKED' || finishReason === 'OTHER';
    const noContent = !data.candidates?.[0]?.content?.parts?.length;
    const promptBlocked = data.promptFeedback?.blockReason;
    return blocked || (noContent && !data.error) || promptBlocked;
}

// Helper to call Gemini API
async function callGemini(url, prompt, useSafety = true) {
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    };
    if (useSafety) body.safetySettings = safetySettings;
    return fetch(`${url}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// Helper function to strip markdown formatting from text
function stripMarkdown(text) {
    if (!text) return text;
    return String(text)
        .replace(/\*\*\*/g, '')      // Bold italic ***text***
        .replace(/\*\*/g, '')         // Bold **text**
        .replace(/\*/g, '')           // Italic *text*
        .replace(/___/g, '')          // Bold italic ___text___
        .replace(/__/g, '')           // Bold __text__
        .replace(/_/g, ' ')           // Italic _text_ (replace with space)
        .replace(/~~~/g, '')          // Strikethrough
        .replace(/~~/g, '')           // Strikethrough ~~text~~
        .replace(/`/g, '')            // Code `text`
        .replace(/#{1,6}\s*/g, '')    // Headers # ## ###
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links [text](url)
        .replace(/\s+/g, ' ')         // Multiple spaces to single
        .trim();
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured. Please add GEMINI_API_KEY to environment variables.' })
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

        const { text } = body;

        if (!text || !text.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No food description provided' })
            };
        }

        const foodDescription = text.trim();

        const prompt = `You are a nutrition expert. The user is describing what they ate. Parse their description and estimate the nutritional information for each food item mentioned.

User's food description: "${foodDescription}"

Return ONLY a valid JSON array with this exact format (no markdown, no explanation, no code blocks):
[
  {
    "name": "Food item name with estimated portion size",
    "calories": 000,
    "protein": 00,
    "carbs": 00,
    "fat": 00
  }
]

Guidelines:
- Be specific about portions based on context (e.g., "Coffee with cream, 12oz" or "Scrambled Eggs, 2 large")
- If no portion is mentioned, assume a typical serving size
- Round calories to nearest 5, macros to nearest gram
- List each food item separately (e.g., "coffee and eggs" becomes two items)
- Use common sense for preparations (e.g., "fried eggs" vs "boiled eggs" have different fat)
- If the description is unclear, make reasonable assumptions based on typical meals
- Return empty array [] if no food items can be identified

Return ONLY the JSON array, nothing else.`;

        let data;
        let content = '';
        let usedFallback = false;

        // Try Gemini 2.5 Flash first
        let response = await callGemini(GEMINI_25_URL, prompt, true);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini 2.5 API error:', response.status, errorText);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis failed',
                    details: `Gemini API returned ${response.status}`
                })
            };
        }

        data = await response.json();
        if (data.candidates?.[0]?.content?.parts) {
            content = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
        }

        // Check if blocked - fallback to 2.0 Flash
        if (!content || isSafetyBlocked(data)) {
            const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'unknown';
            console.log(`Gemini 2.5 blocked (${reason}), falling back to 2.0 Flash...`);

            response = await callGemini(GEMINI_20_URL, prompt, false);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini 2.0 fallback error:', response.status, errorText);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({
                        error: 'AI analysis failed',
                        details: `Gemini API returned ${response.status}`
                    })
                };
            }

            data = await response.json();
            content = '';
            if (data.candidates?.[0]?.content?.parts) {
                content = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
            }
            usedFallback = true;
        }

        console.log(`Gemini response${usedFallback ? ' (2.0 fallback)' : ''}:`, content);

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from the response
            let cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                foods = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Could not parse Gemini response:', trimmedContent);
            }
        }

        // Validate and clean the data
        foods = foods.filter(f => f && f.name && typeof f.calories === 'number');
        foods = foods.map(f => ({
            name: stripMarkdown(f.name).substring(0, 100),
            calories: Math.max(0, Math.round(f.calories)),
            protein: Math.max(0, Math.round(f.protein || 0)),
            carbs: Math.max(0, Math.round(f.carbs || 0)),
            fat: Math.max(0, Math.round(f.fat || 0))
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ foods })
        };

    } catch (error) {
        console.error('Error analyzing food text:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to analyze food description',
                details: error.message
            })
        };
    }
};
