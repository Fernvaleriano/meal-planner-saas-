const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

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
            body: JSON.stringify({ error: 'AI not configured. Please add GEMINI_API_KEY.' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const {
            meal,           // { type, name, calories, protein, carbs, fat, ingredients }
            message,        // User's question/request
            quickAction,    // Optional: 'alternatives', 'higher-protein', 'lower-carb', 'simpler', 'prep-tips'
            dayTargets,     // { calories, protein, carbs, fat }
            clientPreferences, // { allergies, dislikes, dietType }
            chatHistory     // Previous messages in this session
        } = body;

        if (!meal || (!message && !quickAction)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'meal and message/quickAction are required' })
            };
        }

        // Determine if this is a meal suggestion request (should return options)
        const isMealSuggestionRequest = quickAction && ['alternatives', 'higher-protein', 'lower-carb', 'simpler', 'lower-cal'].includes(quickAction);

        // Build the prompt based on quick action or custom message
        let userRequest = message;
        if (quickAction) {
            const actionPrompts = {
                'alternatives': `Suggest 3 alternative meals that could replace "${meal.name}" with similar macros (around ${meal.calories} cal, ${meal.protein}g protein). Keep the same meal type (${meal.type}).`,
                'higher-protein': `Suggest 2-3 variations of "${meal.name}" with MORE protein while keeping calories similar. Current: ${meal.protein}g protein, ${meal.calories} cal. Target: at least ${Math.round(meal.protein * 1.3)}g protein.`,
                'lower-carb': `Suggest 2-3 variations of "${meal.name}" with FEWER carbs while keeping protein similar. Current: ${meal.carbs}g carbs. Target: under ${Math.round(meal.carbs * 0.6)}g carbs.`,
                'simpler': `Suggest 2-3 simpler versions of "${meal.name}" using fewer ingredients and easier preparation, while keeping similar nutrition.`,
                'prep-tips': `Give meal prep tips and suggestions for "${meal.name}". Include storage tips, batch cooking ideas, and time-saving shortcuts.`,
                'lower-cal': `Suggest 2-3 variations of "${meal.name}" with fewer calories while staying satisfying. Current: ${meal.calories} cal. Target: around ${Math.round(meal.calories * 0.75)} cal.`,
                'budget': `Suggest budget-friendly alternatives or modifications for "${meal.name}" using cheaper ingredients.`
            };
            userRequest = actionPrompts[quickAction] || message;
        }

        // Build meal context
        const mealContext = `
CURRENT MEAL (${meal.type.toUpperCase()}):
- Name: ${meal.name}
- Calories: ${meal.calories} cal
- Protein: ${meal.protein}g
- Carbs: ${meal.carbs}g
- Fat: ${meal.fat}g
${meal.ingredients ? `- Ingredients: ${Array.isArray(meal.ingredients) ? meal.ingredients.join(', ') : meal.ingredients}` : ''}
`;

        const targetsContext = dayTargets ? `
DAILY TARGETS:
- Total Calories: ${dayTargets.calories} cal
- Protein: ${dayTargets.protein}g
- Carbs: ${dayTargets.carbs}g
- Fat: ${dayTargets.fat}g
` : '';

        const preferencesContext = clientPreferences ? `
CLIENT PREFERENCES:
${clientPreferences.allergies ? `- Allergies/Avoid: ${clientPreferences.allergies}` : ''}
${clientPreferences.dislikes ? `- Dislikes: ${clientPreferences.dislikes}` : ''}
${clientPreferences.dietType ? `- Diet Type: ${clientPreferences.dietType}` : ''}
` : '';

        const historyContext = chatHistory && chatHistory.length > 0 ? `
PREVIOUS CONVERSATION:
${chatHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'Coach' : 'AI'}: ${msg.content}`).join('\n')}
` : '';

        // Different prompt based on whether we need structured meal suggestions
        let systemPrompt;
        if (isMealSuggestionRequest) {
            systemPrompt = `You are an AI assistant helping a nutrition coach brainstorm meal ideas. You MUST respond with a JSON object containing meal suggestions.

${mealContext}
${targetsContext}
${preferencesContext}
${historyContext}

COACH'S REQUEST: "${userRequest}"

You MUST respond with ONLY a valid JSON object in this exact format (no other text before or after):
{
    "message": "Brief explanation of your suggestions (1-2 sentences)",
    "suggestions": [
        {
            "name": "Meal name with portions (e.g., '6oz Grilled Chicken with Roasted Vegetables')",
            "calories": 450,
            "protein": 40,
            "carbs": 25,
            "fat": 18,
            "description": "Brief description of the meal"
        }
    ]
}

RULES:
- Include 2-3 meal suggestions in the suggestions array
- All macros must be realistic numbers (integers)
- Meal names should include portion sizes
- Consider client preferences and restrictions
- Keep meals practical and easy to prepare
- ONLY output valid JSON, nothing else`;
        } else {
            systemPrompt = `You are an AI assistant helping a nutrition coach brainstorm and refine meal ideas for their client. Be practical, specific, and provide actionable suggestions.

${mealContext}
${targetsContext}
${preferencesContext}
${historyContext}

COACH'S REQUEST: "${userRequest}"

INSTRUCTIONS:
1. Be concise and practical - coaches are busy
2. When suggesting alternatives, include approximate macros for each
3. When modifying meals, explain what changes to make
4. Consider the client's preferences and restrictions
5. Keep suggestions realistic and easy to prepare
6. If suggesting a new meal, format it clearly with name and macros

IMPORTANT:
- Do NOT use markdown formatting like **bold**, *italics*, or bullet points with asterisks
- Use plain text with numbered lists (1. 2. 3.) or dashes (-)
- Keep response under 250 words unless detailed instructions are needed
- Be encouraging and helpful`;
        }

        // Call Gemini AI
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: systemPrompt
                    }]
                }],
                generationConfig: {
                    temperature: isMealSuggestionRequest ? 0.7 : 0.8,
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
                body: JSON.stringify({ error: 'AI brainstorm failed' })
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

        // Try to parse JSON response for meal suggestions
        let suggestions = [];
        let responseMessage = aiResponse;

        if (isMealSuggestionRequest) {
            try {
                // Clean up the response - remove markdown code blocks if present
                let cleanedResponse = aiResponse.trim();
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }

                const parsed = JSON.parse(cleanedResponse);
                if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                    suggestions = parsed.suggestions.map(s => ({
                        name: s.name || 'Unnamed meal',
                        calories: parseInt(s.calories) || 0,
                        protein: parseInt(s.protein) || 0,
                        carbs: parseInt(s.carbs) || 0,
                        fat: parseInt(s.fat) || 0,
                        description: s.description || ''
                    }));
                    responseMessage = parsed.message || 'Here are some suggestions:';
                }
            } catch (parseError) {
                console.log('Could not parse JSON response, using as plain text:', parseError.message);
                // Fall back to plain text response
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: responseMessage,
                suggestions: suggestions,
                hasSuggestions: suggestions.length > 0,
                originalMeal: {
                    type: meal.type,
                    name: meal.name,
                    calories: meal.calories,
                    protein: meal.protein,
                    carbs: meal.carbs,
                    fat: meal.fat
                }
            })
        };

    } catch (error) {
        console.error('Meal Brainstorm error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to brainstorm', details: error.message })
        };
    }
};
