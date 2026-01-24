const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Helper function to call Gemini API with given prompt
async function callGeminiAPI(prompt, safetySettings = null) {
    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
        }
    };

    if (safetySettings) {
        requestBody.safetySettings = safetySettings;
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    return response;
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

        // Safety settings for Gemini API
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
        ];

        // Primary prompt for food analysis
        const primaryPrompt = `You are a nutrition expert. The user is describing what they ate. Parse their description and estimate the nutritional information for each food item mentioned.

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

        // Simplified fallback prompt (less likely to trigger safety filters)
        const fallbackPrompt = `Provide nutritional information for the following meal in JSON format.

Meal: ${foodDescription}

Respond with ONLY a JSON array like this:
[{"name": "Food name", "calories": 100, "protein": 10, "carbs": 10, "fat": 5}]`;

        // Helper to extract content from Gemini response
        const extractContent = (data) => {
            if (data.candidates?.[0]?.content?.parts) {
                return data.candidates[0].content.parts
                    .filter(p => p.text)
                    .map(p => p.text)
                    .join('');
            }
            return '';
        };

        // Helper to check if response was blocked by safety filters
        const isSafetyBlocked = (data) => {
            const finishReason = data.candidates?.[0]?.finishReason;
            const hasBlockedReason = finishReason === 'SAFETY' || finishReason === 'BLOCKED';
            const hasEmptyContent = !data.candidates?.[0]?.content?.parts?.length;
            const hasPromptFeedback = data.promptFeedback?.blockReason;
            return hasBlockedReason || (hasEmptyContent && !data.error) || hasPromptFeedback;
        };

        // Try primary prompt first
        let response = await callGeminiAPI(primaryPrompt, safetySettings);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'AI analysis failed',
                    details: `Gemini API returned ${response.status}`
                })
            };
        }

        let data = await response.json();
        let content = extractContent(data);

        // Check if blocked by safety filters - retry with fallback prompt
        if (!content || isSafetyBlocked(data)) {
            const finishReason = data.candidates?.[0]?.finishReason || 'unknown';
            const blockReason = data.promptFeedback?.blockReason || 'none';
            console.log(`Primary prompt blocked or empty. finishReason: ${finishReason}, blockReason: ${blockReason}. Retrying with fallback prompt...`);
            console.log('Original input:', foodDescription);

            // Wait a moment before retry
            await new Promise(resolve => setTimeout(resolve, 500));

            // Try fallback prompt without safety settings (let the simpler prompt work naturally)
            response = await callGeminiAPI(fallbackPrompt);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API fallback error:', response.status, errorText);
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
            content = extractContent(data);

            // If still blocked, log detailed info
            if (!content || isSafetyBlocked(data)) {
                console.error('Fallback also blocked. Full response:', JSON.stringify(data));
                console.error('Input that caused block:', foodDescription);
            } else {
                console.log('Fallback prompt succeeded');
            }
        }

        console.log('Gemini response content:', content);

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
