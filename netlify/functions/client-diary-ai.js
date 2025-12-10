const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

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
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
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

    // ✅ SECURITY: Verify authenticated user
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    // ✅ SECURITY: Rate limit - 30 AI messages per minute per user
    const rateLimit = checkRateLimit(user.id, 'client-diary-ai', 30, 60000);
    if (!rateLimit.allowed) {
        console.warn(`🚫 Rate limit exceeded for user ${user.id} on client-diary-ai`);
        return rateLimitResponse(rateLimit.resetIn);
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
4. Create meal ideas from ingredients they have available
5. Provide encouragement and practical advice

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

**FOOD LOGGING - When user wants to log food:**
Trigger phrases include: "log", "add", "I had", "I ate", "I just ate", "for breakfast/lunch/dinner", "record", "put in", "track", "I'm eating", "I made", "let's log", "yes log it", "log that", "sounds good log it"
Respond with ONLY this JSON (no markdown, no extra text):
{"action":"log_food","food_name":"descriptive name","calories":number,"protein":number,"carbs":number,"fat":number,"meal_type":"breakfast|lunch|dinner|snack","confirmation":"brief message"}

**INGREDIENT-BASED MEAL IDEAS - When user shares what ingredients they have:**
Trigger phrases include: "I have", "in my fridge", "ingredients", "what can I make", "I only have", "all I have is", "I've got"
1. Suggest 2-3 quick meal ideas using their ingredients that fit their remaining macros
2. Keep suggestions simple and practical (5-15 min prep time)
3. After suggesting, ask: "Would you like me to log one of these for you?"
4. If they pick one, respond with the log_food JSON format above

**GENERAL ADVICE/QUESTIONS:**
- Be encouraging and practical
- Use their actual numbers from today's progress
- Keep responses concise (under 150 words)

**IMPORTANT - CALORIE PRIORITY RULE:**
- If remaining calories are 100 or less (they've hit their calorie target), DO NOT suggest eating more food to hit macros
- Instead, congratulate them on hitting their calorie goal and let them know they're done for the day
- Only mention that tomorrow they can aim for better macro distribution if their protein/carbs/fat were off
- NEVER encourage overeating just to hit protein or other macro targets

**When they still have calories remaining:**
- When suggesting foods, consider what they still need (remaining macros)
- If they need more protein, suggest high-protein options that fit within remaining calories
- If they're low on calories, suggest nutrient-dense foods
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
            // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
            let cleanedResponse = aiResponse
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            // Try to extract JSON from the response
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*?"action"\s*:\s*"log_food"[\s\S]*?\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
                // Validate required fields
                if (parsedResponse.action === 'log_food' && parsedResponse.food_name && typeof parsedResponse.calories === 'number') {
                    // Valid food log response
                } else {
                    parsedResponse = null; // Invalid structure
                }
            }
        } catch (e) {
            // Not JSON, that's fine - it's a text response
            parsedResponse = null;
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
