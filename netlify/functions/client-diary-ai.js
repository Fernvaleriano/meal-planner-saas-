const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Helper function to strip markdown formatting and special characters from text
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
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
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'AI assistant not configured.' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { clientId, clientFirstName, message, todayEntries, goals, totals } = body;

        if (!clientId || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'clientId and message are required' })
            };
        }

        // Calculate remaining macros
        const remaining = {
            calories: (goals?.calorie_goal || 2000) - (totals?.calories || 0),
            protein: (goals?.protein_goal || 150) - (totals?.protein || 0),
            carbs: (goals?.carbs_goal || 200) - (totals?.carbs || 0),
            fat: (goals?.fat_goal || 65) - (totals?.fat || 0)
        };

        // Build context for AI
        const context = `
You are a friendly AI nutrition assistant helping a client with their food diary.${clientFirstName ? ` The client's name is ${clientFirstName} - use their name occasionally to make conversations feel personal and warm.` : ''} You can:
1. Answer questions about nutrition and their progress
2. Help them log food by parsing natural language (respond with JSON when they want to log)
3. Suggest foods to help them hit their macro goals
4. Provide encouragement and practical advice

TODAY'S PROGRESS:
- Calories: ${totals?.calories || 0} / ${goals?.calorie_goal || 2000} (${remaining.calories} remaining)
- Protein: ${Math.round(totals?.protein || 0)}g / ${goals?.protein_goal || 150}g (${Math.round(remaining.protein)}g remaining)
- Carbs: ${Math.round(totals?.carbs || 0)}g / ${goals?.carbs_goal || 200}g (${Math.round(remaining.carbs)}g remaining)
- Fat: ${Math.round(totals?.fat || 0)}g / ${goals?.fat_goal || 65}g (${Math.round(remaining.fat)}g remaining)

TODAY'S LOGGED FOODS:
${todayEntries && todayEntries.length > 0
    ? todayEntries.map(e => `- ${e.meal_type}: ${e.food_name} (${e.calories} cal, ${e.protein}g P)`).join('\n')
    : 'No foods logged yet today.'}

INSTRUCTIONS:
- If the user wants to LOG FOOD (e.g., "log 2 eggs", "I had chicken salad", "add protein shake"), respond with ONLY a JSON object in this exact format:
{
  "action": "log_food",
  "food_name": "descriptive name of the food",
  "calories": estimated_calories_number,
  "protein": estimated_protein_grams,
  "carbs": estimated_carbs_grams,
  "fat": estimated_fat_grams,
  "meal_type": "breakfast|lunch|dinner|snack",
  "confirmation": "brief confirmation message"
}

- If the user is asking a QUESTION or wants ADVICE, respond with helpful text (not JSON).
- Be encouraging and practical. Use their actual numbers.
- Keep responses concise (under 150 words for advice).
- When suggesting foods, consider what they still need (remaining macros).
`;

        // Call Gemini AI
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${context}\n\nUSER MESSAGE: "${message}"`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI assistant temporarily unavailable' })
            };
        }

        const data = await response.json();

        let aiResponse = '';
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            aiResponse = data.candidates[0].content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('');
        }

        // Check if AI wants to log food (response is JSON)
        let parsedResponse = null;
        try {
            // Try to extract JSON from the response
            const jsonMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            // Not JSON, that's fine - it's a text response
        }

        // Strip markdown/special characters from text responses
        // (JSON responses use parsedResponse, so stripping the display text is safe)
        const cleanResponse = stripMarkdown(aiResponse);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: cleanResponse,
                parsed: parsedResponse,
                remaining: remaining
            })
        };

    } catch (error) {
        console.error('Client Diary AI error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to process request', details: error.message })
        };
    }
};
